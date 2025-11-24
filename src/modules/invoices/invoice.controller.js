import InvoiceModel from './invoice.models.js';
import InvoiceItemModel from './invoice-item.models.js';
import Booking from '../bookings/booking.models.js';
import BookingItem from '../bookingItems/bookingItem.models.js';

// ------------------------------
// TẠO HÓA ĐƠN
// ------------------------------
export const createInvoice = async (req, res) => {
    try {
        const { bookingId, discount = 0, method, note } = req.body;

        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Thiếu bookingId' });
        }
        if (!method) {
            return res
                .status(400)
                .json({ success: false, message: 'Thiếu phương thức thanh toán' });
        }

        // 1. Lấy booking
        const booking = await Booking.findById(bookingId)
            .populate('customerId', 'name username phone email')
            .populate('courtId', 'name');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt sân' });
        }

        if (booking.status === 'cancelled') {
            return res
                .status(400)
                .json({ success: false, message: 'Đơn đã hủy không thể thanh toán' });
        }

        // console.log('DEBUG INVOICE_BOOKING:', {
        //     code: booking.code,
        //     total: booking.total,
        //     depositAmount: booking.depositAmount,
        //     depositStatus: booking.depositStatus,
        // });

        const discountVal = Math.max(0, Number(discount) || 0);

        // Tổng tiền booking (sân + thiết bị - giảm giá trên booking nếu có)
        const grossTotal = Number(booking.total || 0);

        // Số tiền đã thanh toán trước (VNPAY / cọc)
        const prepaidAmount = Number(booking.depositAmount || 0);

        // Còn phải thu trước khi áp dụng giảm giá trên HÓA ĐƠN
        const remainingBeforeDiscount = Math.max(0, grossTotal - prepaidAmount);

        // Số tiền cuối cùng cần thu trên hóa đơn
        const totalToPay = Math.max(0, remainingBeforeDiscount - discountVal);

        // 2. Tạo mã hóa đơn
        const code = InvoiceModel.generateCode();

        // 3. Tạo invoice (số tiền trên hóa đơn = số tiền CÒN PHẢI THU)
        const invoice = await InvoiceModel.create({
            code,
            bookingId: booking._id,
            customerId: booking.customerId || null,
            total: totalToPay,
            discount: discountVal,
            method,
            note: note || '',
            status: 'paid',
            paidAt: new Date(),
        });

        // 4. Tạo các dòng chi tiết
        const items = [];
        // ===== TIỀN SÂN =====
        if (booking.fieldAmount && booking.fieldAmount > 0) {
            // số giờ đã lưu trong booking (createBooking đã set hours = số ca)
            const hours = booking.hours && booking.hours > 0 ? booking.hours : 1;

            // đơn giá mỗi giờ = tổng tiền sân / số giờ
            const pricePerHour = Math.round(Number(booking.fieldAmount) / hours);

            items.push({
                invoiceId: invoice._id,
                name: `Tiền sân ${booking.courtId?.name || ''}`.trim(),
                qty: hours, // 👉 số lượng = số giờ
                unit: 'giờ', // 👉 đơn vị = giờ
                price: pricePerHour, // 👉 đơn giá / giờ
                type: 'field',
                subtotal: pricePerHour * hours, // vẫn = booking.fieldAmount
            });
        }

        // ===== THIẾT BỊ (mỗi thiết bị 1 dòng, đúng đơn vị cái/đôi/quả/…) =====
        const bookingItems = await BookingItem.find({ bookingId: booking._id })
            .populate('equipmentId', 'name unit')
            .lean();

        for (const bi of bookingItems) {
            const displayName = bi.name || bi.equipmentId?.name || 'Thiết bị';
            const unit = bi.unit || bi.equipmentId?.unit || 'gói';

            items.push({
                invoiceId: invoice._id,
                name: displayName,
                qty: bi.qty,
                unit,
                price: bi.price,
                // dùng chung type 'rental' cho tất cả thiết bị để không phải sửa schema
                type: 'rental',
                subtotal: bi.subtotal,
            });
        }

        if (items.length) {
            await InvoiceItemModel.insertMany(items);
        }

        // Cập nhật booking -> đã thanh toán đủ
        booking.paymentStatus = 'paid';
        booking.paymentMethod = method;
        await booking.save();

        //  BẮN SOCKET cho admin + client để reload danh sách
        const io = req.app.get('io');
        io?.emit('booking_global_updated'); // admin BookingList
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
        res.status(500).json({ success: false, message: error.message });
    }
};

// ------------------------------
// LẤY HÓA ĐƠN THEO BOOKING
// ------------------------------
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

// ------------------------------
// LẤY CHI TIẾT HÓA ĐƠN
// ------------------------------
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

// ------------------------------
// CẬP NHẬT TRẠNG THÁI THANH TOÁN
// ------------------------------
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
