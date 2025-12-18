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
import BookingItem from '../bookingItems/bookingItem.models.js';
import Equipment from '../equipments/equipment.models.js';

import {
    VNP_URL,
    VNP_TMN_CODE,
    VNP_HASH_SECRET,
    VNP_RETURN_URL,
    FRONT_END_URL,
} from '../../common/config/environment.js';

import { commitVoucherUsage, rollbackVoucherUsage } from '../vouchers/voucher.service.js';

// Tỉ lệ cọc so với TỔNG (field + equipment - discount)
// 1 = thanh toán FULL
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

const getStockFieldName = (eq) =>
    typeof eq.availableQuantity === 'number'
        ? 'availableQuantity'
        : typeof eq.stockLeft === 'number'
          ? 'stockLeft'
          : typeof eq.stock === 'number'
            ? 'stock'
            : 'totalQuantity';

const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

//  trả kho + xoá bookingItems (dùng khi cancel/fail)
const restoreEquipAndDeleteItems = async (bookingId) => {
    const items = await BookingItem.find({ bookingId: String(bookingId) })
        .lean()
        .catch(() => []);
    for (const it of items) {
        const eq = await Equipment.findById(it.equipmentId).catch(() => null);
        if (!eq) continue;

        const stockField = getStockFieldName(eq);
        eq[stockField] = safeNum(eq[stockField]) + safeNum(it.qty);
        await eq.save().catch(() => {});
    }

    await BookingItem.deleteMany({ bookingId: String(bookingId) }).catch(() => {});
};

const cancelBookingSystem = async (booking, reason) => {
    if (!booking) return;

    // không động vào đơn đã hoàn tất/đang dùng
    if ([BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(booking.status)) return;

    //  trả kho + xoá bookingItems
    await restoreEquipAndDeleteItems(booking._id);

    // rollback voucher nếu đã "applied" do createVnpayPayment commit sớm
    if (booking.voucherId && booking.voucherUsageStatus === 'applied' && booking.customerId) {
        try {
            await rollbackVoucherUsage(booking.voucherId, booking.customerId, booking._id);
        } catch (e) {
            console.error('❌ rollbackVoucherUsage error:', e?.message || e);
        }
    }

    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelBy = 'system';
    booking.cancelReason = reason || 'Thanh toán VNPay thất bại/huỷ';
    booking.cancelledAt = new Date();
    booking.updatedAt = new Date();

    // reset các field “treo”
    booking.autoCancelAt = null;
    booking.paymentStatus = PAYMENT_STATUS.UNPAID;
    booking.depositAmount = 0;
    booking.depositStatus = DEPOSIT_STATUS.PENDING;
    booking.depositMethod = undefined;

    // reset thiết bị/tổng
    booking.equipmentTotal = 0;
    booking.total = Math.max(0, safeNum(booking.fieldAmount) - safeNum(booking.discountTotal));

    // voucher trong booking này không còn ý nghĩa
    booking.voucherUsageStatus = 'none';
    booking.voucherUsageId = undefined;

    await booking.save().catch(() => {});
};

//  TÍNH equipmentTotal CHUẨN: support bookingId trong BookingItem là ObjectId hoặc String
const buildEquipmentMap = async (bookingIdsObj) => {
    const objIds = bookingIdsObj.map((id) => new mongoose.Types.ObjectId(String(id)));
    const strIds = bookingIdsObj.map((id) => String(id));

    const itemsAgg = await BookingItem.aggregate([
        {
            $match: {
                $or: [{ bookingId: { $in: objIds } }, { bookingId: { $in: strIds } }],
            },
        },
        { $group: { _id: '$bookingId', total: { $sum: '$subtotal' } } },
    ]);

    // key normalize về string
    return new Map(itemsAgg.map((r) => [String(r._id), safeNum(r.total)]));
};

const calcBookingTotal = (b, equipmentMap) => {
    const field = safeNum(b.fieldAmount);
    const discount = safeNum(b.discountTotal);

    const eqAgg = equipmentMap?.get(String(b._id)) || 0;
    const eqStored = safeNum(b.equipmentTotal);

    //  nếu schema bookingItem bookingId mismatch trước đây => eqAgg có thể 0
    // lấy cái lớn hơn
    const eqTotal = Math.max(eqAgg, eqStored);

    return Math.max(0, field + eqTotal - discount);
};

const calcPaidDeposit = (b) =>
    b.depositStatus === DEPOSIT_STATUS.PAID ? safeNum(b.depositAmount) : 0;

//  TẠO THANH TOÁN VNPAY
export const createVnpayPayment = async (req, res, next) => {
    try {
        const { bookingId, bookingIds, amount, isRetryPayment } = req.body;

        const isRetry = isRetryPayment === true || isRetryPayment === 'true';

        let ids = [];
        if (Array.isArray(bookingIds) && bookingIds.length > 0) ids = bookingIds;
        else if (bookingId) ids = [bookingId];
        else {
            return res
                .status(400)
                .json({ success: false, message: 'Thiếu bookingId hoặc bookingIds' });
        }

        const invalidId = ids.find((id) => !isValidObjectId(id));
        if (invalidId) {
            return res.status(400).json({
                success: false,
                message: `bookingId không hợp lệ: ${invalidId}`,
            });
        }

        const bookings = await Booking.find({ _id: { $in: ids } });
        if (!bookings || bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });
        }

        // chặn đơn đã hủy / đã PAID đủ
        const invalid = bookings.find(
            (b) => b.status === BOOKING_STATUS.CANCELLED || b.paymentStatus === PAYMENT_STATUS.PAID
        );
        if (invalid) {
            return res.status(400).json({
                success: false,
                message: `Có ca không hợp lệ để thanh toán (đã hủy hoặc đã thanh toán đủ): ${invalid.code}`,
            });
        }

        //  auto-cancel: nếu hết hạn thì cancel + trả kho + rollback voucher cho TẤT CẢ bookings trong nhóm
        const now = new Date();
        const expired = bookings.some(
            (b) =>
                b.autoCancelAt &&
                b.autoCancelAt <= now &&
                b.status === BOOKING_STATUS.PENDING &&
                b.paymentStatus === PAYMENT_STATUS.UNPAID
        );

        if (expired) {
            await Promise.all(
                bookings.map((b) =>
                    cancelBookingSystem(
                        b,
                        'Hết thời gian thanh toán online (5 phút), đơn tự động hủy.'
                    )
                )
            );

            return res.status(400).json({
                success: false,
                message: 'Đơn đã hết hạn thanh toán (quá 5 phút). Vui lòng đặt sân lại.',
            });
        }

        // tính equipmentTotal đúng (support bookingId string/ObjectId)
        const equipmentMap = await buildEquipmentMap(bookings.map((b) => b._id));

        // sync lại booking.equipmentTotal + booking.total (optional nhưng nên)
        for (const b of bookings) {
            const newTotal = calcBookingTotal(b, equipmentMap);

            const eqAgg = equipmentMap.get(String(b._id)) || 0;
            const eqStored = safeNum(b.equipmentTotal);
            const eqTotal = Math.max(eqAgg, eqStored);

            const needUpdate =
                safeNum(b.equipmentTotal) !== eqTotal || safeNum(b.total) !== newTotal;

            if (needUpdate) {
                b.equipmentTotal = eqTotal;
                b.total = newTotal;
                await b.save().catch(() => {});
            }
        }

        const total = bookings.reduce((sum, b) => sum + calcBookingTotal(b, equipmentMap), 0);

        const oldDeposit = bookings.reduce((sum, b) => sum + calcPaidDeposit(b), 0);

        const remaining = Math.max(0, total - oldDeposit);
        if (remaining <= 0) {
            return res
                .status(400)
                .json({ success: false, message: 'Đơn này đã thanh toán đủ tiền!' });
        }

        // payNow
        let payNow = 0;
        if (isRetry) {
            const clientAmount = safeNum(amount);
            payNow = clientAmount > 0 ? Math.min(clientAmount, remaining) : remaining;
        } else {
            let depositAmount = Math.round(total * DEPOSIT_RATE); // FULL
            depositAmount = Math.min(depositAmount, remaining);
            payNow = depositAmount;
        }

        if (!payNow || payNow <= 0) {
            return res
                .status(400)
                .json({ success: false, message: 'Số tiền thanh toán không hợp lệ!' });
        }

        // Commit voucher (chỉ lần đầu, không retry)
        if (!isRetry) {
            const committed = [];
            try {
                for (const b of bookings) {
                    if (b.voucherId && b.voucherUsageStatus === 'pending' && b.customerId) {
                        const usage = await commitVoucherUsage({
                            voucherId: b.voucherId,
                            bookingId: b._id,
                            userId: b.customerId,
                            discountAmount: b.voucherDiscount || 0,
                            // orderTotal nên là fieldAmount (rule voucher thường tính trên tiền sân)
                            orderTotal: b.fieldAmount || 0,
                        });

                        b.voucherUsageId = usage._id;
                        b.voucherUsageStatus = 'applied';
                        await b.save();

                        committed.push(b);
                    }
                }
            } catch (error) {
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

        //  VNPay params
        const bookingCodesStr = bookings
            .map((b) => b.code)
            .filter(Boolean)
            .join(',');

        const txnRef = makeTxnRef();

        const createDate = new Date()
            .toISOString()
            .replace(/[-T:\.Z]/g, '')
            .slice(0, 14);

        // VNPay nhận VND * 100
        const vnpAmount = Math.round(payNow * 100);

        const bookingIdsStr = ids.join(',');
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

        const rspCode = String(vnp_Params.vnp_ResponseCode || '');
        const amountFromVnp = Number(vnp_Params.vnp_Amount || 0);
        const paidAmount = amountFromVnp / 100;

        const rawOrderInfo = vnp_Params.vnp_OrderInfo || '';
        let decodedOrderInfo = rawOrderInfo;

        try {
            decodedOrderInfo = decodeURIComponent(rawOrderInfo.replace(/\+/g, ' '));
            if (/%3D|%2C/i.test(decodedOrderInfo))
                decodedOrderInfo = decodeURIComponent(decodedOrderInfo);
        } catch (e) {
            console.error(' Lỗi decode vnp_OrderInfo:', e?.message || e);
        }

        const parsedInfo = qs.parse(decodedOrderInfo);
        const idsStrRaw = parsedInfo.BOOKING_IDS || parsedInfo['BOOKING_IDS'];

        const bookingIds = String(idsStrRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        const validIds = bookingIds.filter(isValidObjectId);
        if (!validIds.length || validIds.length !== bookingIds.length) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
        }

        const bookings = await Booking.find({ _id: { $in: validIds } });
        if (!bookings || bookings.length === 0) {
            return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
        }
        //  SUCCESS
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

                    if (
                        b.status === BOOKING_STATUS.CANCELLED &&
                        String(b.cancelReason || '')
                            .toLowerCase()
                            .includes('vnpay')
                    ) {
                        b.status = BOOKING_STATUS.PENDING;
                        b.cancelBy = undefined;
                        b.cancelReason = undefined;
                        b.cancelledAt = undefined;
                    }

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

                if (
                    booking.status === BOOKING_STATUS.CANCELLED &&
                    String(booking.cancelReason || '')
                        .toLowerCase()
                        .includes('vnpay')
                ) {
                    booking.status = BOOKING_STATUS.PENDING;
                    booking.cancelBy = undefined;
                    booking.cancelReason = undefined;
                    booking.cancelledAt = undefined;
                }

                await booking.save();
            }
        } else {
            //  FAIL / CANCEL
            // QUAN TRỌNG: KHÔNG HỦY BOOKING khi user cancel hoặc fail.
            // Chỉ rollback voucher + giữ đơn ở PENDING để "Thanh toán lại".
            for (const b of bookings) {
                // rollback voucher nếu đã commit
                if (
                    b.voucherId &&
                    b.voucherUsageStatus === 'applied' &&
                    b.voucherUsageId &&
                    b.customerId
                ) {
                    try {
                        await rollbackVoucherUsage(b.voucherId, b.customerId, b._id);

                        b.voucherUsageStatus = 'pending';
                        b.voucherUsageId = undefined;
                        b.voucherRestoredAt = new Date();
                    } catch (error) {
                        console.error('❌ Lỗi khi rollback voucher:', error.message);
                    }
                }

                // nếu có CANCELLED vì VNPay fail/cancel thì gỡ ra
                if (
                    b.status === BOOKING_STATUS.CANCELLED &&
                    String(b.cancelReason || '')
                        .toLowerCase()
                        .includes('vnpay')
                ) {
                    b.status = BOOKING_STATUS.PENDING;
                    b.cancelBy = undefined;
                    b.cancelReason = undefined;
                    b.cancelledAt = undefined;
                }

                // giữ trạng thái thanh toán đúng
                const dep = Number(b.depositAmount || 0);
                if (dep > 0) b.paymentStatus = PAYMENT_STATUS.PARTIAL;
                else b.paymentStatus = PAYMENT_STATUS.UNPAID;

                // (optional) lưu trace fail vào note/cancelReason riêng
                b.paymentFailReason = `VNPay fail/cancel. ResponseCode=${rspCode}`; // nếu schema có field này
                b.paymentFailAt = new Date(); // nếu schema có field này

                await b.save().catch(() => {});
            }
        }

        // Bắn socket cho FE
        const io = req.app.get('io');
        io?.emit('booking_global_updated');

        for (const b of bookings) {
            const d = b?.date ? new Date(b.date) : null;
            io?.to(String(b.courtId)).emit('booking_updated', {
                courtId: String(b.courtId),
                date: d ? d.toISOString().slice(0, 10) : undefined,
            });
        }

        const queryParams = { ...req.query, status: rspCode };
        const query = new URLSearchParams(queryParams).toString();
        return res.redirect(`${FRONT_END_URL}/payment-return?${query}`);
    } catch (err) {
        next(err);
    }
};
