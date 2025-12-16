import {
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHOD,
    DEPOSIT_STATUS,
} from '../../common/constants/enums.js';

import crypto from 'crypto';
import qs from 'qs';
import mongoose from 'mongoose';
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

function makeTxnRef() {
    const t = Date.now().toString(); // 13 số
    const r = crypto.randomBytes(4).toString('hex'); // 8 ký tự hex
    return `BK${t}${r}`.slice(0, 34); // VNPay giới hạn <= 34
}

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));

//  TẠO THANH TOÁN VNPAY
export const createVnpayPayment = async (req, res, next) => {
    try {
        const { bookingId, bookingIds, amount, isRetryPayment } = req.body;

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

        // Validate ObjectId trước khi query (tránh CastError)
        const invalidId = ids.find((id) => !isValidObjectId(id));
        if (invalidId) {
            return res.status(400).json({
                success: false,
                message: `bookingId không hợp lệ: ${invalidId}`,
            });
        }

        //  Lấy bookings
        const bookings = await Booking.find({ _id: { $in: ids } });
        if (!bookings || bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });
        }

        //  Chặn thanh toán booking đã hủy / đã paid đủ
        const invalid = bookings.find(
            (b) => b.status === BOOKING_STATUS.CANCELLED || b.paymentStatus === PAYMENT_STATUS.PAID
        );
        if (invalid) {
            return res.status(400).json({
                success: false,
                message: `Có ca không hợp lệ để thanh toán (đã hủy hoặc đã thanh toán đủ): ${invalid.code}`,
            });
        }

        // booking “đại diện” để check autoCancel, code...
        const booking = bookings[0];

        //  Check auto-cancel (chỉ áp dụng pending + unpaid)
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

            await booking.save();

            return res.status(400).json({
                success: false,
                message: 'Đơn đã hết hạn thanh toán (quá 5 phút). Vui lòng đặt sân lại.',
            });
        }

        //  Tổng tiền của TẤT CẢ booking
        const total = bookings.reduce((sum, b) => sum + Number(b.total || b.fieldAmount || 0), 0);
        if (!total || total <= 0) {
            return res.status(400).json({ success: false, message: 'Tổng tiền không hợp lệ!' });
        }

        //  Tổng tiền đã cọc của cả nhóm
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

        //  Tính số tiền trả lần này
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

        //  Commit voucher (chỉ lần đầu, không phải retry)
        if (!isRetryPayment) {
            const committed = [];
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
                // rollback các ca đã commit
                for (const b of committed) {
                    try {
                        await rollbackVoucherUsage(b.voucherId, b.customerId, b._id);
                        b.voucherUsageStatus = 'pending';
                        b.voucherUsageId = undefined;
                        await b.save();
                    } catch {}
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

        //  Chuẩn bị VNPay params
        const bookingCodesStr = bookings
            .map((b) => b.code)
            .filter(Boolean)
            .join(',');
        const txnRef = makeTxnRef(); // luôn unique

        const createDate = new Date()
            .toISOString()
            .replace(/[-T:\.Z]/g, '')
            .slice(0, 14);

        const vnpAmount = payNow * 100;
        const bookingIdsStr = ids.join(',');

        //  QUAN TRỌNG: OrderInfo format chuẩn để callback parse bằng qs.parse
        // (giá trị sẽ được encode bởi sortObject => an toàn)
        const orderInfo = qs.stringify(
            { BOOKING_IDS: bookingIdsStr, CODES: bookingCodesStr },
            { encode: false }
        );

        const vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMN_CODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: txnRef,
            vnp_OrderInfo: orderInfo,
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
        const amountFromVnp = Number(vnp_Params.vnp_Amount || 0);
        const paidAmount = amountFromVnp / 100;

        //  Parse vnp_OrderInfo đúng cách
        const rawOrderInfo = vnp_Params.vnp_OrderInfo || '';
        let decodedOrderInfo = rawOrderInfo;

        try {
            decodedOrderInfo = decodeURIComponent(rawOrderInfo.replace(/\+/g, ' '));
            // nếu còn encoded sâu thì decode thêm
            if (/%3D|%2C/i.test(decodedOrderInfo)) {
                decodedOrderInfo = decodeURIComponent(decodedOrderInfo);
            }
        } catch (e) {
            console.error('⚠️ Lỗi decode vnp_OrderInfo:', e?.message || e);
        }

        // orderInfo là dạng: "BOOKING_IDS=a,b,c&CODES=BK..."
        const parsedInfo = qs.parse(decodedOrderInfo);
        const idsStrRaw = parsedInfo.BOOKING_IDS || parsedInfo['BOOKING_IDS'];

        const bookingIds = String(idsStrRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        // Validate IDs để tránh cast fail
        const validIds = bookingIds.filter(isValidObjectId);
        if (!validIds.length || validIds.length !== bookingIds.length) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
        }

        const bookings = await Booking.find({ _id: { $in: validIds } });
        if (!bookings || bookings.length === 0) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
        }

        let voucherStatus = 'none';
        let voucherErrorMessage = '';

        //  THANH TOÁN THÀNH CÔNG
        if (rspCode === '00' && paidAmount > 0) {
            if (bookings.length > 1) {
                let remaining = paidAmount;

                const sortedBookings = [...bookings].sort(
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
                    if (newDeposit > 0) b.depositStatus = DEPOSIT_STATUS.PAID;

                    if (newDeposit >= total) b.paymentStatus = PAYMENT_STATUS.PAID;
                    else if (newDeposit > 0) b.paymentStatus = PAYMENT_STATUS.PARTIAL;
                    else b.paymentStatus = PAYMENT_STATUS.UNPAID;

                    await b.save();
                    remaining -= add;
                }
            } else {
                const booking = bookings[0];
                const oldDeposit = Number(booking.depositAmount || 0);
                const newDeposit = oldDeposit + paidAmount;

                booking.depositAmount = newDeposit;
                booking.depositMethod = PAYMENT_METHOD.VNPAY;
                booking.depositStatus = DEPOSIT_STATUS.PAID;

                const total = Number(booking.total || booking.fieldAmount || 0);
                if (total > 0 && newDeposit >= total) booking.paymentStatus = PAYMENT_STATUS.PAID;
                else if (newDeposit > 0) booking.paymentStatus = PAYMENT_STATUS.PARTIAL;
                else booking.paymentStatus = PAYMENT_STATUS.UNPAID;

                if (booking.voucherUsageStatus === 'applied') voucherStatus = 'applied';

                await booking.save();
            }
        } else {
            //  THANH TOÁN THẤT BẠI – rollback voucher
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

        const queryParams = { ...req.query, status: rspCode };

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
