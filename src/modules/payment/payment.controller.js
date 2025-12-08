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
import { commitVoucherUsage, rollbackVoucherUsage } from '../vouchers/voucher.service.js';

// Tỉ lệ cọc so với TIỀN SÂN — 1 = thanh toán FULL tiền sân
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

//  TẠO THANH TOÁN VNPAY
export const createVnpayPayment = async (req, res, next) => {
    try {
        const { bookingId, bookingIds, amount, isRetryPayment } = req.body;
        //console.log(' VNPay body:', { bookingId, bookingIds, amount, isRetryPayment });

        // Gom list id cần thanh toán
        let ids = [];
        if (Array.isArray(bookingIds) && bookingIds.length > 0) {
            ids = bookingIds;
        } else if (bookingId) {
            ids = [bookingId];
        } else {
            return res
                .status(400)
                .json({ success: false, message: 'Thiếu bookingId hoặc bookingIds' });
        }

        const bookings = await Booking.find({ _id: { $in: ids } });
        // console.log(
        //     ' Found bookings:',
        //     bookings.map((b) => ({ id: b._id.toString(), code: b.code }))
        // );

        if (!bookings || bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });
        }

        // booking “đại diện” để check autoCancel, code...
        const booking = bookings[0];

        const now = new Date();
        if (
            booking.autoCancelAt &&
            booking.autoCancelAt <= now &&
            booking.status === BOOKING_STATUS.PENDING &&
            booking.paymentStatus === PAYMENT_STATUS.UNPAID
        ) {
            booking.status = BOOKING_STATUS.CANCELLED;
            booking.cancelBy = 'system';
            booking.cancelReason = 'Hết thời gian thanh toán online (5 phút), đơn tự động hủy.';
            booking.cancelledAt = now;

            try {
                await booking.save();
            } catch (err) {
                if (err.name === 'ValidationError') {
                    return res.status(400).json({
                        success: false,
                        message: 'Không thể cập nhật trạng thái đơn đặt sân. Dữ liệu không hợp lệ!',
                    });
                }
                return next(err);
            }

            return res.status(400).json({
                success: false,
                message: 'Đơn đã hết hạn thanh toán (quá 5 phút). Vui lòng đặt sân lại.',
            });
        }

        // Tổng tiền của TẤT CẢ booking
        const total = bookings.reduce((sum, b) => sum + Number(b.total || b.fieldAmount || 0), 0);
        if (!total || total <= 0) {
            return res.status(400).json({ success: false, message: 'Tổng tiền không hợp lệ!' });
        }

        // Tổng tiền đã cọc của cả nhóm
        const oldDeposit = bookings.reduce(
            (sum, b) =>
                sum + (b.depositStatus === DEPOSIT_STATUS.PAID ? Number(b.depositAmount || 0) : 0),
            0
        );

        const remaining = Math.max(0, total - oldDeposit);
        if (remaining <= 0) {
            return res
                .status(400)
                .json({ success: false, message: 'Đơn này đã thanh toán đủ tiền!' });
        }

        let payNow = 0;
        if (isRetryPayment) {
            const clientAmount = Number(amount || 0);
            payNow = clientAmount > 0 ? Math.min(clientAmount, remaining) : remaining;
        } else {
            let depositAmount = Math.round(total * DEPOSIT_RATE); // DEPOSIT_RATE = 1
            depositAmount = Math.min(depositAmount, remaining);
            payNow = depositAmount;
        }

        if (!payNow || payNow <= 0) {
            return res
                .status(400)
                .json({ success: false, message: 'Số tiền thanh toán không hợp lệ!' });
        }

        //   voucher CHO TỪNG BOOKING có voucher (kể cả nhiều ca)
        //    Nếu ca nào commit fail (hết lượt / hết hạn) thì rollback lại các ca đã commit và báo lỗi.
        if (!isRetryPayment) {
            const committed = []; // lưu các booking đã commit để rollback nếu có lỗi

            try {
                for (const b of bookings) {
                    if (b.voucherId && b.voucherUsageStatus === 'pending' && b.customerId) {
                        const usage = await commitVoucherUsage({
                            voucherId: b.voucherId,
                            bookingId: b._id,
                            userId: b.customerId,
                            discountAmount: b.voucherDiscount || 0,
                            orderTotal: b.fieldAmount || b.total || 0,
                        });

                        b.voucherUsageId = usage._id;
                        b.voucherUsageStatus = 'applied';
                        await b.save();

                        committed.push(b);
                    }
                }
            } catch (error) {
                console.error('❌ Lỗi commit voucher cho nhóm booking:', error);

                // rollback lại những booking đã commit voucher trước đó
                for (const b of committed) {
                    try {
                        await rollbackVoucherUsage(b.voucherId, b.customerId, b._id);
                        b.voucherUsageStatus = 'pending';
                        b.voucherUsageId = undefined;
                        await b.save();
                    } catch (rbErr) {
                        console.error('⚠️ Lỗi rollback voucher khi commit fail:', rbErr);
                    }
                }

                const isOutOfUsage =
                    error.statusCode === 409 ||
                    error.message?.includes('hết lượt') ||
                    error.message?.includes('hết lượt sử dụng');

                if (isOutOfUsage) {
                    return res.status(409).json({
                        success: false,
                        message:
                            'Voucher bạn chọn đã hết lượt sử dụng trong lúc thanh toán. Vui lòng chọn voucher khác.',
                        code: 'VOUCHER_OUT_OF_STOCK',
                    });
                }

                return res.status(400).json({
                    success: false,
                    message: error.message || 'Không thể áp dụng voucher. Vui lòng thử lại.',
                });
            }
        }

        // GHÉP NHIỀU MÃ BOOKING THÀNH 1 CHUỖI ĐỂ HIỂN THỊ Ở “Mã đơn hàng”
        const bookingCodesStr = bookings
            .map((b) => b.code)
            .filter(Boolean)
            .join(',');

        const orderId = bookingCodesStr || booking.code; // vnp_TxnRef hiển thị: BKxxxxx,BKyyyy

        const createDate = new Date()
            .toISOString()
            .replace(/[-T:\.Z]/g, '')
            .slice(0, 14);

        const vnpAmount = payNow * 100;
        const bookingIdsStr = ids.join(',');

        const vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMN_CODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: orderId,
            // Lưu list booking để callback dùng
            vnp_OrderInfo: `BOOKING_IDS=${bookingIdsStr}`,
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

//  VNPAY CALLBACK
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

        if (secureHash !== signed) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=invalid`);
        }

        const rspCode = vnp_Params.vnp_ResponseCode; // '00' = OK
        const txnRef = vnp_Params.vnp_TxnRef; // có thể là "BK1,BK2" khi nhiều booking
        const amountFromVnp = Number(vnp_Params.vnp_Amount || 0);
        const paidAmount = amountFromVnp / 100;

        //  LẤY NHÓM BOOKING THEO BOOKING_IDS (DECODE)
        const rawOrderInfo = vnp_Params.vnp_OrderInfo || '';

        let decodedOrderInfo = rawOrderInfo;
        try {
            // VNPay hay dùng dấu + thay cho space => đổi về space rồi decode
            decodedOrderInfo = decodeURIComponent(rawOrderInfo.replace(/\+/g, ' '));

            // nếu sau khi decode vẫn còn %3D / %2C thì decode thêm lần nữa
            if (
                decodedOrderInfo.includes('%3D') ||
                decodedOrderInfo.includes('%2C') ||
                decodedOrderInfo.includes('%3d') ||
                decodedOrderInfo.includes('%2c')
            ) {
                decodedOrderInfo = decodeURIComponent(decodedOrderInfo);
            }
        } catch (e) {
            console.error('⚠️ Lỗi decode vnp_OrderInfo:', e?.message || e);
        }

        const marker = 'BOOKING_IDS=';
        let bookingIds = [];

        const idx = decodedOrderInfo.indexOf(marker);
        if (idx !== -1) {
            const idsStr = decodedOrderInfo.slice(idx + marker.length);
            bookingIds = idsStr
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }

        let bookings = [];

        if (bookingIds.length > 0) {
            bookings = await Booking.find({ _id: { $in: bookingIds } });
            if (!bookings || bookings.length === 0) {
                return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
            }
        } else {
            // Fallback: luồng cũ – 1 booking
            // Nếu vnp_TxnRef là "BK1,BK2" thì lấy BK1
            let codeToFind = txnRef;
            if (txnRef && txnRef.includes(',')) {
                codeToFind = txnRef.split(',')[0].trim();
            }

            const booking = await Booking.findOne({ code: codeToFind });
            if (!booking) {
                return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
            }
            bookings = [booking];
        }

        let voucherStatus = 'none';
        let voucherErrorMessage = '';

        //  THANH TOÁN THÀNH CÔNG
        if (rspCode === '00' && paidAmount > 0) {
            if (bookings.length > 1) {
                //  NHIỀU BOOKING: chia số tiền thực tế cho từng booking
                let remaining = paidAmount;

                const sortedBookings = bookings.sort(
                    (a, b) =>
                        new Date(a.date || a.createdAt).getTime() -
                        new Date(b.date || b.createdAt).getTime()
                );

                for (const b of sortedBookings) {
                    if (remaining <= 0) break;

                    const total = Number(b.total || b.fieldAmount || 0);
                    if (!total) continue;

                    const currentDeposit =
                        b.depositStatus === DEPOSIT_STATUS.PAID ? Number(b.depositAmount || 0) : 0;

                    const need = Math.max(0, total - currentDeposit);
                    if (need <= 0) continue;

                    const add = Math.min(need, remaining);
                    const newDeposit = currentDeposit + add;

                    b.depositAmount = newDeposit;
                    b.depositMethod = PAYMENT_METHOD.VNPAY;
                    if (newDeposit > 0) {
                        b.depositStatus = DEPOSIT_STATUS.PAID;
                    }

                    if (newDeposit >= total) {
                        b.paymentStatus = PAYMENT_STATUS.PAID;
                    } else if (newDeposit > 0) {
                        b.paymentStatus = PAYMENT_STATUS.PARTIAL;
                    } else {
                        b.paymentStatus = PAYMENT_STATUS.UNPAID;
                    }

                    await b.save();
                    remaining -= add;
                }
            } else {
                //   BOOKING
                const booking = bookings[0];
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

                if (booking.voucherUsageStatus === 'applied') {
                    voucherStatus = 'applied';
                }

                await booking.save();
            }
        } else {
            //  THANH TOÁN THẤT BẠI – rollback voucher cho TẤT CẢ booking đã applied
            for (const booking of bookings) {
                if (
                    booking.voucherId &&
                    booking.voucherUsageStatus === 'applied' &&
                    booking.voucherUsageId &&
                    booking.customerId
                ) {
                    try {
                        await rollbackVoucherUsage(
                            booking.voucherId,
                            booking.customerId,
                            booking._id
                        );
                        booking.voucherUsageStatus = 'restored';
                        booking.voucherRestoredAt = new Date();
                        await booking.save();
                        // console.log(
                        //     ` Đã rollback voucher cho booking ${booking.code} do thanh toán thất bại`
                        // );
                    } catch (error) {
                        console.error('❌ Lỗi khi rollback voucher:', error.message);
                    }
                }
            }
        }

        // Bắn socket cho FE
        const io = req.app.get('io');
        io?.emit('booking_global_updated');
        for (const b of bookings) {
            io?.to(String(b.courtId)).emit('booking_updated', {
                courtId: String(b.courtId),
                date: b.date.toISOString().slice(0, 10),
            });
        }

        const queryParams = {
            ...req.query,
            status: rspCode,
        };

        if (voucherStatus === 'expired') {
            queryParams.voucherStatus = 'expired';
            queryParams.voucherMessage =
                voucherErrorMessage ||
                'Voucher bạn chọn đã hết lượt sử dụng trong lúc thanh toán. Hệ thống đã tính lại tổng tiền không áp dụng voucher.';
        }

        const query = new URLSearchParams(queryParams).toString();
        return res.redirect(`${FRONT_END_URL}/payment-return?${query}`);
    } catch (err) {
        next(err);
    }
};
