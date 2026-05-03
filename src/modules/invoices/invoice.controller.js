import InvoiceModel from './invoice.models.js';
import InvoiceItemModel from './invoice-item.models.js';
import Booking from '../bookings/booking.models.js';
import BookingItem from '../bookingItems/bookingItem.models.js';

// TẠO HÓA ĐƠN
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

        //  Lấy booking + snapshot thông tin liên quan để in hóa đơn
        const booking = await Booking.findById(bookingId)
            .populate('customerId', 'name username phone email') // để hiển thị khách hàng trên hóa đơn
            .populate('courtId', 'name'); // để hiển thị tên sân trên hóa đơn

        if (!booking) {
            // booking không tồn tại => không thể tạo hóa đơn
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt sân' });
        }

        // booking đã hủy => không cho tạo/thu tiền
        if (booking.status === 'cancelled') {
            return res
                .status(400)
                .json({ success: false, message: 'Đơn đã hủy không thể thanh toán' });
        }

        // Chống bấm 2 lần: nếu booking đã có invoice thì trả về luôn
        //    (Tránh tạo 2 hóa đơn cho cùng 1 booking)
        const existed = await InvoiceModel.findOne({ bookingId: booking._id }).sort({
            createdAt: -1,
        });
        if (existed) {
            // lấy kèm items để FE mở ngay trang xem/in mà không cần gọi API khác
            const existedItems = await InvoiceItemModel.findFullByInvoice(existed._id);
            return res.status(200).json({
                success: true,
                message: 'Đơn này đã có hóa đơn',
                invoice: existed,
                items: existedItems,
            });
        }

        const discountVal = Math.max(0, Number(discount) || 0);

        //  Recalc thiết bị theo DB
        const agg = await BookingItem.aggregate([
            { $match: { bookingId: booking._id } },
            { $group: { _id: '$bookingId', total: { $sum: '$subtotal' } } },
        ]);
        const equipmentTotalFromDb = Number(agg?.[0]?.total || 0);
        const equipmentTotal = Math.max(equipmentTotalFromDb, Number(booking.equipmentTotal || 0));

        // Tổng hiện tại của booking (Sân + Thiết bị - Voucher/discountTotal trên booking)
        const fieldAmount = Number(booking.fieldAmount || 0);
        const voucherDiscount = Number(booking.discountTotal || 0);
        const grossTotal = Math.max(0, fieldAmount + equipmentTotal - voucherDiscount);

        //  Đã thanh toán trước (chỉ tính khi depositStatus PAID)
        const prepaidAmount =
            booking.depositStatus === 'paid' ? Number(booking.depositAmount || 0) : 0;

        const remainingBeforeDiscount = Math.max(0, grossTotal - prepaidAmount);

        // giảm trên hóa đơn chỉ được giảm trên phần còn phải thu
        const discountApplied = Math.min(discountVal, remainingBeforeDiscount);

        const totalToPay = Math.max(0, remainingBeforeDiscount - discountApplied);

        //  Tạo invoice: totalToPay = 0 vẫn tạo
        //    Mục tiêu: có hóa đơn để IN cho khách
        const code = InvoiceModel.generateCode(); // mã hóa đơn HDxxxxxxx

        // Nếu invoice = 0 (khách đã trả đủ), method ưu tiên lấy method đã lưu trên booking
        // nếu booking chưa có method thì dùng method FE gửi lên (để không null)
        const invoiceMethod = totalToPay === 0 ? booking.paymentMethod || method : method;

        const invoice = await InvoiceModel.create({
            code,
            bookingId: booking._id,
            customerId: booking.customerId || null,
            total: totalToPay, // có thể = 0 => vẫn OK để in
            discount: discountApplied, // giảm giá áp dụng lên phần còn phải thu
            method: invoiceMethod,
            note: note || '',
            status: 'paid', // hóa đơn xác nhận thanh toán (kể cả 0đ)
            paidAt: new Date(),
        });

        // Tạo items: tiền sân + thiết bị
        //    (items dùng để in chi tiết từng dòng)
        const items = [];

        // Tiền sân (chia theo giờ/slot để in đẹp)
        if (booking.fieldAmount && booking.fieldAmount > 0) {
            // hours = số ca/giờ đã lưu trên booking (fallback = 1)
            const hours = booking.hours && booking.hours > 0 ? booking.hours : 1;

            // đơn giá mỗi giờ = tổng tiền sân / số giờ
            const pricePerHour = Math.round(Number(booking.fieldAmount) / hours);

            items.push({
                invoiceId: invoice._id,
                name: `Tiền sân ${booking.courtId?.name || ''}`.trim(),
                qty: hours,
                unit: 'giờ',
                price: pricePerHour,
                type: 'field',
                subtotal: pricePerHour * hours, // = booking.fieldAmount
            });
        }

        //  Thiết bị (mỗi thiết bị 1 dòng)
        const bookingItems = await BookingItem.find({ bookingId: booking._id })
            .populate('equipmentId', 'name unit mode')
            .lean();

        for (const bi of bookingItems) {
            const displayName = bi.name || bi.equipmentId?.name || 'Thiết bị';
            const unit = bi.unit || bi.equipmentId?.unit || 'gói';
            const mode = bi.mode || bi.equipmentId?.mode || null;

            items.push({
                invoiceId: invoice._id,
                name: displayName,
                qty: bi.qty,
                unit,
                price: bi.price,
                // phân loại để in Thuê/Bán
                type: mode === 'sell' ? 'sale' : 'rental',
                mode,
                subtotal: bi.subtotal,
            });
        }

        // lưu items xuống DB
        if (items.length) {
            await InvoiceItemModel.insertMany(items);
        }

        // sync lại tổng (để các màn hình khác đọc 1 nguồn)
        booking.equipmentTotal = equipmentTotal;
        booking.total = grossTotal;

        // tiền đã thu trước + thu thêm ở hóa đơn này
        const paidBefore = prepaidAmount; // đã tính theo depositStatus ở trên
        const paidAfter = Math.min(grossTotal, paidBefore + totalToPay);

        // cập nhật depositAmount theo tổng đã thu (không cộng bừa vào deposit cũ khi depositStatus chưa PAID)
        booking.depositAmount = paidAfter;

        // paymentStatus theo số tiền đã thu
        if (grossTotal > 0 && paidAfter >= grossTotal) booking.paymentStatus = 'paid';
        else if (paidAfter > 0) booking.paymentStatus = 'partial';
        else booking.paymentStatus = 'unpaid';

        // depositStatus theo paidAfter
        if (grossTotal > 0 && paidAfter >= grossTotal) booking.depositStatus = 'paid';

        // chỉ đổi phương thức khi có thu thêm
        if (totalToPay > 0) booking.paymentMethod = method;
        else booking.paymentMethod = booking.paymentMethod || method;

        await booking.save();

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

        const invoice = await InvoiceModel.findOne({ bookingId })
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

        if (!invoice) {
            return res
                .status(404)
                .json({ success: false, message: 'Không tìm thấy hóa đơn cho đơn này' });
        }

        const items = await InvoiceItemModel.findFullByInvoice(invoice._id);

        res.json({
            success: true,
            invoice,
            items,
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

        res.json({ success: true, invoice, items });
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
