import {
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHOD,
    DEPOSIT_STATUS,
} from '../../common/constants/enums.js';
import crypto from 'crypto';
import qs from 'qs';
import Booking from '../bookings/booking.models.js';
import {
    VNP_URL,
    VNP_TMN_CODE,
    VNP_HASH_SECRET,
    VNP_RETURN_URL,
    FRONT_END_URL,
} from '../../common/config/environment.js';

// Tỉ lệ cọc so với TIỀN SÂN
// 1   = thanh toán FULL tiền sân
// 0.3 = cọc 30% tiền sân
const DEPOSIT_RATE = 1;

function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj)
        .map((k) => encodeURIComponent(k))
        .sort();
    for (const key of keys) {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
    }
    return sorted;
}

// ==============================
// Tạo URL thanh toán VNPAY (tiền sân)
// ==============================
export const createVnpayPayment = async (req, res, next) => {
    try {
        const { bookingId, amount, isRetryPayment } = req.body;
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Thiếu bookingId' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });
        }

        // Không cho thanh toán đơn đã hủy
        if (booking.status === BOOKING_STATUS.CANCELLED) {
            return res
                .status(400)
                .json({ success: false, message: 'Đơn này đã bị hủy, không thể thanh toán!' });
        }

        // Tổng tiền cần thanh toán cho booking
        const total = Number(booking.total || booking.fieldAmount || 0);
        if (!total || total <= 0) {
            return res.status(400).json({ success: false, message: 'Tổng tiền không hợp lệ!' });
        }

        const oldDeposit =
            booking.depositStatus === DEPOSIT_STATUS.PAID ? Number(booking.depositAmount || 0) : 0;
        const remaining = Math.max(0, total - oldDeposit);

        if (remaining <= 0) {
            return res
                .status(400)
                .json({ success: false, message: 'Đơn này đã thanh toán đủ tiền!' });
        }

        let payNow = 0;

        if (isRetryPayment) {
            // 👉 THANH TOÁN LẠI: chỉ cho trả phần còn thiếu
            const clientAmount = Number(amount || 0);
            payNow = clientAmount > 0 ? Math.min(clientAmount, remaining) : remaining;
        } else {
            // 👉 THANH TOÁN LẦN ĐẦU: tính theo tỉ lệ cọc (DEPOSIT_RATE)
            let depositAmount = Math.round(total * DEPOSIT_RATE);
            // không được vượt quá phần còn lại
            depositAmount = Math.min(depositAmount, remaining);
            payNow = depositAmount;
        }

        if (!payNow || payNow <= 0) {
            return res
                .status(400)
                .json({ success: false, message: 'Số tiền thanh toán không hợp lệ!' });
        }

        const orderId = booking.code;
        const createDate = new Date()
            .toISOString()
            .replace(/[-T:\.Z]/g, '')
            .slice(0, 14);

        // VNPAY dùng đơn vị = VND * 100
        const vnpAmount = payNow * 100;

        const vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMN_CODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: orderId,
            vnp_OrderInfo: `Thanh toan cho don ${orderId}`,
            vnp_OrderType: 'billpayment',
            vnp_Amount: vnpAmount,
            vnp_ReturnUrl: VNP_RETURN_URL,
            vnp_IpAddr: req.ip || '127.0.0.1',
            vnp_CreateDate: createDate,
        };

        const sorted = sortObject(vnp_Params);
        const signData = qs.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET.trim());
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        sorted.vnp_SecureHash = signed;

        const paymentUrl = `${VNP_URL}?${qs.stringify(sorted, { encode: false })}`;

        return res.json({
            success: true,
            data: { paymentUrl, payNow, remaining, total, oldDeposit },
        });
    } catch (err) {
        next(err);
    }
};

// ==============================
// VNPAY callback
// ==============================
export const vnpayReturn = async (req, res, next) => {
    try {
        let vnp_Params = { ...req.query };
        const secureHash = vnp_Params.vnp_SecureHash;

        delete vnp_Params.vnp_SecureHash;
        delete vnp_Params.vnp_SecureHashType;

        vnp_Params = sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET.trim());
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        // Sai chữ ký -> trả về FE báo invalid
        if (secureHash !== signed) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=invalid`);
        }

        const rspCode = vnp_Params.vnp_ResponseCode; // '00' = thành công
        const txnRef = vnp_Params.vnp_TxnRef; // booking.code
        const amountFromVnp = Number(vnp_Params.vnp_Amount || 0); // đơn vị: VND * 100
        const paidAmount = amountFromVnp / 100; // VND thực tế

        // Tìm booking theo code
        const booking = await Booking.findOne({ code: txnRef });
        if (!booking) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
        }

        //  Ghi nhận tiền đã thanh toán (cộng dồn cọc + cập nhật paymentStatus)
        if (rspCode === '00' && paidAmount > 0) {
            const oldDeposit = Number(booking.depositAmount || 0);
            const newDeposit = oldDeposit + paidAmount;

            booking.depositAmount = newDeposit;
            booking.depositMethod = PAYMENT_METHOD.VNPAY;
            booking.depositStatus = DEPOSIT_STATUS.PAID;

            const total = Number(booking.total || booking.fieldAmount || 0);

            if (total > 0 && newDeposit >= total) {
                booking.paymentStatus = PAYMENT_STATUS.PAID;
            } else if (newDeposit > 0) {
                booking.paymentStatus = PAYMENT_STATUS.PARTIAL;
            } else {
                booking.paymentStatus = PAYMENT_STATUS.UNPAID;
            }

            await booking.save();
        }

        // Bắn socket cho FE cập nhật lịch sân
        const io = req.app.get('io');
        io?.emit('booking_global_updated');
        io?.to(String(booking.courtId)).emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });

        const query = new URLSearchParams({
            ...req.query,
            status: rspCode,
        }).toString();

        return res.redirect(`${FRONT_END_URL}/payment-return?${query}`);
    } catch (err) {
        next(err);
    }
};
