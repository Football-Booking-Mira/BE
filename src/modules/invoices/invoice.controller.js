import InvoiceModel from './invoice.models.js';
import InvoiceItemModel from './invoice-item.models.js';
import Booking from '../bookings/booking.models.js';
import BookingItem from '../bookingItems/bookingItem.models.js';

// TẠO HÓA ĐƠN (GỘP CHO CẢ ĐƠN/ORDER)
export const createInvoice = async (req, res) => {
    try {
        // Nhận dữ liệu từ client
        const { bookingId, discount = 0, method, note } = req.body;

        //  Validate input bắt buộc
        if (!bookingId) {
            // bookingId là khóa để biết tạo hóa đơn cho booking nào
            return res.status(400).json({ success: false, message: 'Thiếu bookingId' });
        }
        if (!method) {
            // method là phương thức thanh toán tại sân (hoặc fallback khi invoice=0)
            return res
                .status(400)
                .json({ success: false, message: 'Thiếu phương thức thanh toán' });
        }

        //  Lấy booking chính + snapshot thông tin liên quan để in hóa đơn
        const booking = await Booking.findById(bookingId)
            .populate('customerId', 'name username phone email') // để hiển thị khách hàng trên hóa đơn
            .populate('courtId', 'name'); // để hiển thị tên sân trên hóa đơn

        if (!booking) {
            // booking không tồn tại => không thể tạo hóa đơn
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt sân' });
        }

        // Lấy tất cả bookings thuộc cùng 1 đơn hàng (orderId)
        let bookingsInOrder = [];
        if (booking.orderId) {
            bookingsInOrder = await Booking.find({
                orderId: booking.orderId,
                status: { $ne: 'cancelled' },
            }).populate('customerId', 'name username phone email').populate('courtId', 'name');
        } else {
            bookingsInOrder = [booking];
        }

        const siblingIds = bookingsInOrder.map((b) => b._id);

        // Chống bấm 2 lần: nếu bất kỳ booking nào trong nhóm đã có invoice thì trả về luôn
        const existed = await InvoiceModel.findOne({ bookingId: { $in: siblingIds } }).sort({
            createdAt: -1,
        });
        if (existed) {
            const existedItems = await InvoiceItemModel.findFullByInvoice(existed._id);
            return res.status(200).json({
                success: true,
                message: 'Đơn này đã có hóa đơn',
                invoice: existed,
                items: existedItems,
            });
        }

        const discountVal = Math.max(0, Number(discount) || 0);

        // Lấy tất cả booking items (thiết bị) của nhóm bookings
        const allBookingItems = await BookingItem.find({ bookingId: { $in: siblingIds } })
            .populate('equipmentId', 'name unit mode')
            .lean();

        let totalFieldAmount = 0;
        let totalVoucherDiscount = 0;
        let totalEquipmentTotal = 0;
        let totalGrossTotal = 0;
        let totalPrepaidAmount = 0;

        for (const b of bookingsInOrder) {
            const bItems = allBookingItems.filter(
                (item) => String(item.bookingId) === String(b._id)
            );
            const eqTotalFromDb = bItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
            const eqTotal = Math.max(eqTotalFromDb, Number(b.equipmentTotal || 0));

            const fieldAmount = Number(b.fieldAmount || 0);
            const voucherDiscount = Number(b.discountTotal || 0);
            const grossTotal = Math.max(0, fieldAmount + eqTotal - voucherDiscount);
            const prepaid = b.depositStatus === 'paid' ? Number(b.depositAmount || 0) : 0;

            totalFieldAmount += fieldAmount;
            totalVoucherDiscount += voucherDiscount;
            totalEquipmentTotal += eqTotal;
            totalGrossTotal += grossTotal;
            totalPrepaidAmount += prepaid;
        }

        const remainingBeforeDiscount = Math.max(0, totalGrossTotal - totalPrepaidAmount);
        const discountApplied = Math.min(discountVal, remainingBeforeDiscount);
        const totalToPay = Math.max(0, remainingBeforeDiscount - discountApplied);

        //  Tạo invoice: totalToPay = 0 vẫn tạo
        const code = InvoiceModel.generateCode();
        const invoiceMethod = totalToPay === 0 ? booking.paymentMethod || method : method;

        const invoice = await InvoiceModel.create({
            code,
            bookingId: booking._id, // Gắn với booking đầu để tương thích DB schema
            customerId: booking.customerId || null,
            total: totalToPay,
            discount: discountApplied,
            method: invoiceMethod,
            note: note || '',
            status: 'paid',
            paidAt: new Date(),
        });

        // Tạo items cho tất cả bookings trong đơn gộp
        const items = [];

        for (const b of bookingsInOrder) {
            if (b.fieldAmount && b.fieldAmount > 0) {
                const hours = b.hours && b.hours > 0 ? b.hours : 1;
                const pricePerHour = Math.round(Number(b.fieldAmount) / hours);

                items.push({
                    invoiceId: invoice._id,
                    name: `Tiền sân ${b.courtId?.name || ''} (${b.code})`.trim(),
                    qty: hours,
                    unit: 'giờ',
                    price: pricePerHour,
                    type: 'field',
                    subtotal: pricePerHour * hours,
                });
            }

            const bItems = allBookingItems.filter(
                (item) => String(item.bookingId) === String(b._id)
            );
            for (const bi of bItems) {
                const displayName = `${bi.name || bi.equipmentId?.name || 'Thiết bị'} (${b.code})`;
                const unit = bi.unit || bi.equipmentId?.unit || 'cái';
                const mode = bi.mode || bi.equipmentId?.mode || null;

                items.push({
                    invoiceId: invoice._id,
                    name: displayName,
                    qty: bi.qty,
                    unit,
                    price: bi.price,
                    type: mode === 'sell' ? 'sale' : 'rental',
                    mode,
                    subtotal: bi.subtotal,
                });
            }
        }

        // lưu items xuống DB
        if (items.length) {
            await InvoiceItemModel.insertMany(items);
        }

        // Cập nhật trạng thái đã thanh toán cho tất cả bookings trong nhóm
        for (const b of bookingsInOrder) {
            const bItems = allBookingItems.filter(
                (item) => String(item.bookingId) === String(b._id)
            );
            const eqTotalFromDb = bItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
            const eqTotal = Math.max(eqTotalFromDb, Number(b.equipmentTotal || 0));
            const gross = Math.max(0, Number(b.fieldAmount || 0) + eqTotal - Number(b.discountTotal || 0));

            b.equipmentTotal = eqTotal;
            b.total = gross;
            b.depositAmount = gross; // Đánh dấu đã thanh toán đủ tiền
            b.paymentStatus = 'paid';
            b.depositStatus = 'paid';
            b.paymentMethod = invoiceMethod;
            await b.save();
        }

        //Emit socket để admin/client reload list
        const io = req.app.get('io');
        io?.emit('booking_global_updated'); // admin list
        io?.to(String(booking.courtId)).emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });

        return res.status(201).json({
            success: true,
            message: 'Tạo hóa đơn thanh toán thành công',
            invoice,
            items,
            bookings: bookingsInOrder,
        });
    } catch (error) {
        console.error(error);
        // lỗi bất ngờ => 500
        res.status(500).json({ success: false, message: error.message });
    }
};

// LẤY HÓA ĐƠN THEO BOOKING

export const getInvoiceByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Thiếu bookingId' });
        }

        // Tìm invoice gắn trực tiếp với booking
        let invoice = await InvoiceModel.findOne({ bookingId })
            .sort({ createdAt: -1 })
            .populate({
                path: 'bookingId',
                populate: [
                    { path: 'customerId', model: 'User' },
                    { path: 'courtId', model: 'Court' },
                    {
                        path: 'voucherId',
                        model: 'Voucher',
                        select: 'code discountType discountValue maxDiscountValue',
                    },
                ],
            })
            .populate('customerId');

        // Nếu không có hóa đơn trực tiếp, kiểm tra xem có hóa đơn nào của bookings cùng Order không
        if (!invoice) {
            const booking = await Booking.findById(bookingId);
            if (booking && booking.orderId) {
                const siblings = await Booking.find({ orderId: booking.orderId }, { _id: 1 });
                const siblingIds = siblings.map((s) => s._id);
                invoice = await InvoiceModel.findOne({ bookingId: { $in: siblingIds } })
                    .sort({ createdAt: -1 })
                    .populate({
                        path: 'bookingId',
                        populate: [
                            { path: 'customerId', model: 'User' },
                            { path: 'courtId', model: 'Court' },
                            {
                                path: 'voucherId',
                                model: 'Voucher',
                                select: 'code discountType discountValue maxDiscountValue',
                            },
                        ],
                    })
                    .populate('customerId');
            }
        }

        if (!invoice) {
            return res
                .status(404)
                .json({ success: false, message: 'Không tìm thấy hóa đơn cho đơn này' });
        }

        let bookingsInOrder = [];
        if (invoice && invoice.bookingId) {
            const mainBooking = invoice.bookingId;
            if (mainBooking.orderId) {
                bookingsInOrder = await Booking.find({
                    orderId: mainBooking.orderId,
                    status: { $ne: 'cancelled' },
                }).populate('courtId', 'name').lean();
            } else {
                bookingsInOrder = [mainBooking];
            }
        }

        res.json({
            success: true,
            invoice,
            items,
            bookings: bookingsInOrder,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- ADMIN: chỉnh sửa giá sân trong hóa đơn ---
export const adjustInvoiceFieldPrice = async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const { newFieldAmount } = req.body;

        if (typeof newFieldAmount !== 'number' || Number.isNaN(newFieldAmount) || newFieldAmount < 0) {
            return res.status(400).json({ success: false, message: 'newFieldAmount không hợp lệ' });
        }

        const invoice = await InvoiceModel.findById(invoiceId);
        if (!invoice) return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });

        const booking = await Booking.findById(invoice.bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Không tìm thấy booking liên quan' });

        // tìm mục tiền sân
        const fieldItem = await InvoiceItemModel.findOne({ invoiceId: invoice._id, type: 'field' });
        if (!fieldItem) return res.status(400).json({ success: false, message: 'Hóa đơn không có mục "Tiền sân" để chỉnh sửa' });

        const qty = Number(fieldItem.qty || 1);
        const newPricePerUnit = Math.round(Number(newFieldAmount) / qty);
        const newSubtotal = newPricePerUnit * qty;
        const delta = newSubtotal - Number(fieldItem.subtotal || 0);

        // cập nhật item
        fieldItem.price = newPricePerUnit;
        fieldItem.subtotal = newSubtotal;
        await fieldItem.save();

        // cập nhật tổng hóa đơn
        invoice.total = Math.max(0, Number(invoice.total || 0) + delta);
        await invoice.save();

        // cập nhật booking
        booking.fieldAmount = Number(newFieldAmount);
        booking.total = Math.max(0, Number(booking.fieldAmount || 0) + Number(booking.equipmentTotal || 0) - Number(booking.discountTotal || 0));

        // đảm bảo depositAmount không vượt quá tổng
        booking.depositAmount = Math.min(Number(booking.depositAmount || 0), booking.total);

        // cập nhật trạng thái thanh toán
        if (booking.total > 0 && booking.depositAmount >= booking.total) booking.paymentStatus = 'paid';
        else if (booking.depositAmount > 0) booking.paymentStatus = 'partial';
        else booking.paymentStatus = 'unpaid';

        await booking.save();

        const items = await InvoiceItemModel.findFullByInvoice(invoice._id);

        // emit socket để reload
        const io = req.app.get('io');
        io?.emit('booking_global_updated');
        io?.to(String(booking.courtId)).emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });

        return res.json({ success: true, message: 'Cập nhật giá sân trong hóa đơn thành công', invoice, items, booking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ------------------------------
// LẤY DANH SÁCH HÓA ĐƠN
// ------------------------------
export const getInvoices = async (req, res) => {
    try {
        const invoices = await InvoiceModel.find()
            .sort({ createdAt: -1 })
            .populate('bookingId')
            .populate('customerId');
        res.json({ success: true, invoices });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// LẤY CHI TIẾT HÓA ĐƠN

export const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await InvoiceModel.findById(id)
            .populate({ path: 'bookingId', populate: { path: 'customerId', model: 'User' } })
            .populate('customerId');

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        const items = await InvoiceItemModel.findFullByInvoice(id);

        let bookingsInOrder = [];
        if (invoice && invoice.bookingId) {
            const mainBooking = invoice.bookingId;
            if (mainBooking.orderId) {
                bookingsInOrder = await Booking.find({
                    orderId: mainBooking.orderId,
                    status: { $ne: 'cancelled' },
                }).populate('courtId', 'name').lean();
            } else {
                bookingsInOrder = [mainBooking];
            }
        }

        res.json({ success: true, invoice, items, bookings: bookingsInOrder });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// CẬP NHẬT TRẠNG THÁI THANH TOÁN
export const updateInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paidAt, gatewayTxnId, method } = req.body;

        const invoice = await InvoiceModel.findById(id);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        if (status) invoice.status = status;
        if (method) invoice.method = method;
        if (gatewayTxnId) invoice.gatewayTxnId = gatewayTxnId;
        if (paidAt) invoice.paidAt = paidAt;

        await invoice.save();

        res.json({ success: true, invoice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};
