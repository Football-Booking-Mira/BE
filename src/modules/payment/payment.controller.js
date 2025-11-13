import crypto from 'crypto';
import qs from 'qs';
import Booking from '../bookings/booking.models.js';
import { VNP_URL, VNP_TMN_CODE, VNP_HASH_SECRET, VNP_RETURN_URL } from '../../common/config/environment.js';

function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).map(k => encodeURIComponent(k)).sort();
    for (const key of keys) {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
    }
    return sorted;
}

export const createVnpayPayment = async (req, res, next) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) return res.status(400).json({ success: false, message: 'Thiếu bookingId' });

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });

        const orderId = 'BK' + Date.now();
        const createDate = new Date().toISOString().replace(/[-T:\.Z]/g, '').slice(0, 14);
        const amount = booking.total * 100;

        const vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMN_CODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: orderId,
            vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
            vnp_OrderType: 'billpayment',
            vnp_Amount: amount,
            vnp_ReturnUrl: VNP_RETURN_URL,
            vnp_IpAddr: req.ip || '127.0.0.1',
            vnp_CreateDate: createDate,
        };

        console.log("vnp_Params: ", vnp_Params);


        const sorted = sortObject(vnp_Params);
        const signData = qs.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET.trim());
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        sorted['vnp_SecureHash'] = signed;
        const paymentUrl = `${VNP_URL}?${qs.stringify(sorted, { encode: false })}`;

        res.json({ success: true, paymentUrl });
    } catch (err) {
        next(err);
    }
};

export const vnpayReturn = async (req, res, next) => {
    try {
        let vnp_Params = req.query;
        const secureHash = vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET.trim());
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash === signed) {
            const booking = await Booking.findOne({ code: vnp_Params.vnp_TxnRef });
            if (!booking) return res.redirect(`${VNP_RETURN_URL}?status=error`);

            if (vnp_Params.vnp_ResponseCode === '00') {
                booking.paymentStatus = 'PAID';
                booking.status = 'CONFIRMED';
            } else {
                booking.paymentStatus = 'FAILED';
            }
            await booking.save();

            return res.redirect(`${VNP_RETURN_URL}?status=${vnp_Params.vnp_ResponseCode}`);
        } else {
            return res.redirect(`${VNP_RETURN_URL}?status=invalid`);
        }
    } catch (err) {
        next(err);
    }
};
