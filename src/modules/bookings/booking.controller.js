import {
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHOD,
    USER_ROLES,
    DEPOSIT_STATUS,
} from '../../common/constants/enums.js';
import Order from '../orders/order.models.js';
import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import BookingItem from '../bookingItems/bookingItem.models.js';
import { Court } from '../courts/court.models.js';
import Equipment from '../equipments/equipment.models.js';
import Booking from './booking.models.js';
import {
    commitVoucherUsage,
    restoreVoucherUsage,
    validateVoucherForOrder,
} from '../vouchers/voucher.service.js';

const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

// Xác định 1 booking có thực sự "giữ sân" hay không
const isBlockingBooking = (b) => {
    // Đơn đã hủy thì không bao giờ block
    if (b.status === BOOKING_STATUS.CANCELLED) return false;

    // Booking tạm trong createMultiBooking (không có paymentMethod/createdBy)
    // dùng để tránh 2 slot trong cùng request đè nhau -> luôn block
    if (!b.paymentMethod && !b.createdBy && b.slots) {
        return true;
    }

    const depositPaid = (b.depositAmount || 0) > 0 && b.depositStatus === DEPOSIT_STATUS.PAID;

    // Xem đã có tiền chưa
    const hasPaid =
        b.paymentStatus === PAYMENT_STATUS.PAID ||
        b.paymentStatus === PAYMENT_STATUS.REFUNDED ||
        depositPaid;

    // Đơn do ADMIN tạo hoặc thanh toán CASH tại quầy -> luôn giữ sân
    if (b.createdBy === USER_ROLES.ADMIN || b.paymentMethod === PAYMENT_METHOD.CASH) {
        return true;
    }

    // Đơn ONLINE (VNPAY / MOMO):
    // chỉ giữ sân khi đã có tiền (paid / refunded / đã cọc)
    if ([PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(b.paymentMethod)) {
        return !!hasPaid;
    }

    // Các loại khác: có tiền thì block, không thì thôi
    return !!hasPaid;
};

// Chuyển 1 danh sách slot thành list khoảng thời gian (đơn vị: phút)
const buildIntervalsFromSlots = (slots = [], fallbackStart, fallbackEnd) => {
    if (Array.isArray(slots) && slots.length > 0) {
        return slots.map((s) => ({
            start: toMinutes(s.startTime),
            end: toMinutes(s.endTime),
        }));
    }
    return [
        {
            start: toMinutes(fallbackStart),
            end: toMinutes(fallbackEnd),
        },
    ];
};

// Kiểm tra 1 list slot cần đặt có đụng bất kỳ booking nào không
const hasAnyOverlapWithBookings = (
    requestSlots, // [{ startTime, endTime }]
    existingBookings, // list Booking query trong DB
    ignoreBookingId = null
) => {
    const reqIntervals = buildIntervalsFromSlots(
        requestSlots,
        requestSlots[0]?.startTime,
        requestSlots[0]?.endTime
    );

    for (const b of existingBookings) {
        if (ignoreBookingId && String(b._id) === String(ignoreBookingId)) continue;

        if (!isBlockingBooking(b)) continue;

        const bookingIntervals = buildIntervalsFromSlots(b.slots, b.startTime, b.endTime);

        for (const r of reqIntervals) {
            for (const i of bookingIntervals) {
                if (overlap(r.start, r.end, i.start, i.end) > 0) {
                    return true;
                }
            }
        }
    }

    return false;
};

//* Cấu hình ca giờ
const START_HOUR = 6; // 06:00
const END_HOUR = 22; // 22:00
const SLOT_DURATION = 60; // 1 ca = 60 phút
const BREAK_DURATION = 15; // nghỉ 15p giữa các ca
const PEAK_START_HOUR = 16; // từ 16h trở đi là cao điểm

const minToTime = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

//* Tạo danh sách ca: 06:00-07:00, 07:15-08:15, ..., 21:00-22:00
const generateTimeSlots = () => {
    const slots = [];
    let current = START_HOUR * 60;
    const endDay = END_HOUR * 60;

    while (current + SLOT_DURATION <= endDay) {
        const start = minToTime(current);
        const end = minToTime(current + SLOT_DURATION);
        slots.push({ start, end });
        current += SLOT_DURATION + BREAK_DURATION;
    }
    return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Gom slots thành các nhóm LIỀN NHAU.
const groupSlotsByContinuous = (slots = []) => {
    if (!Array.isArray(slots) || slots.length === 0) return [];

    const sorted = [...slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    const groups = [];
    let current = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const gap = toMinutes(cur.startTime) - toMinutes(prev.endTime);

        if (gap <= BREAK_DURATION) {
            current.push(cur);
        } else {
            groups.push(current);
            current = [cur];
        }
    }
    groups.push(current);
    return groups;
};

/*
 * Tính tiền sân theo SỐ CA (không tính 15 phút nghỉ)
 */
const calcFieldPriceBySlots = (startTime, endTime, court) => {
    const startMinRaw = toMinutes(startTime);
    const endMinRaw = toMinutes(endTime);

    if (Number.isNaN(startMinRaw) || Number.isNaN(endMinRaw) || endMinRaw <= startMinRaw) {
        return {
            slotCount: 0,
            fieldAmount: 0,
            normalHours: 0,
            peakHours: 0,
            totalHours: 0,
            breakMinutes: 0,
        };
    }

    const openStart = START_HOUR * 60;
    const openEnd = END_HOUR * 60;

    const realStart = Math.max(startMinRaw, openStart);
    const realEnd = Math.min(endMinRaw, openEnd);
    if (realEnd <= realStart) {
        return {
            slotCount: 0,
            fieldAmount: 0,
            normalHours: 0,
            peakHours: 0,
            totalHours: 0,
            breakMinutes: 0,
        };
    }

    let slotCount = 0;
    let fieldAmount = 0;
    let normalHours = 0;
    let peakHours = 0;

    TIME_SLOTS.forEach((slot) => {
        const s = toMinutes(slot.start);
        const e = toMinutes(slot.end);

        if (s >= realStart && e <= realEnd) {
            slotCount += 1;

            const isPeak = Math.floor(s / 60) >= PEAK_START_HOUR;
            if (isPeak) {
                fieldAmount += court.peakPrice;
                peakHours += 1;
            } else {
                fieldAmount += court.basePrice;
                normalHours += 1;
            }
        }
    });

    const totalHours = slotCount;
    const breakMinutes = slotCount > 1 ? (slotCount - 1) * BREAK_DURATION : 0;

    return {
        slotCount,
        fieldAmount,
        normalHours,
        peakHours,
        totalHours,
        breakMinutes,
    };
};

/*
 * Tính tiền sân từ danh sách các ca FE gửi lên (slots[])
 */
const calcFieldPriceFromSlotsList = (rawSlots = [], court) => {
    if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
        return { slotCount: 0, fieldAmount: 0, totalHours: 0, normalHours: 0, peakHours: 0 };
    }

    let fieldAmount = 0;
    let totalHours = 0;
    let slotCount = 0;
    let normalHours = 0;
    let peakHours = 0;

    for (const s of rawSlots) {
        if (!s || !s.startTime || !s.endTime) {
            throw createError(400, 'Slot không hợp lệ (thiếu startTime / endTime)!');
        }

        const {
            slotCount: c,
            fieldAmount: fa,
            totalHours: th,
            normalHours: nh,
            peakHours: ph,
        } = calcFieldPriceBySlots(s.startTime, s.endTime, court);

        if (c !== 1) {
            throw createError(
                400,
                `Khung giờ ${s.startTime} - ${s.endTime} không hợp lệ hoặc không phải 1 ca 60 phút!`
            );
        }

        fieldAmount += fa;
        totalHours += th;
        slotCount += c;
        normalHours += nh;
        peakHours += ph;
    }

    return { slotCount, fieldAmount, totalHours, normalHours, peakHours };
};

//* Tính tiền theo ca (support GET query và POST body)
export const calculateBookingPrice = handleAsync(async (req, res, next) => {
    const courtId = req.body.courtId || req.query.courtId;
    const slots = req.body.slots;

    const startTime = req.body.startTime || req.query.startTime;
    const endTime = req.body.endTime || req.query.endTime;

    if (!courtId) {
        return next(createError(400, 'Thiếu dữ liệu để tính tiền!'));
    }

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    if (Array.isArray(slots) && slots.length > 0) {
        const { slotCount, fieldAmount, totalHours, normalHours, peakHours } =
            calcFieldPriceFromSlotsList(slots, court);

        if (slotCount === 0) {
            return next(createError(400, 'Danh sách ca không hợp lệ!'));
        }

        return res.status(200).json(
            createResponse(true, 200, 'Tính tiền thành công!', {
                fieldAmount,
                equipmentTotal: 0,
                discountTotal: 0,
                total: fieldAmount,
                normalHours,
                peakHours,
                totalHours,
            })
        );
    }

    if (!startTime || !endTime) {
        return next(createError(400, 'Thiếu dữ liệu để tính tiền!'));
    }

    const { slotCount, fieldAmount, normalHours, peakHours, totalHours } = calcFieldPriceBySlots(
        startTime,
        endTime,
        court
    );

    if (slotCount === 0) {
        return next(
            createError(400, 'Khung giờ không hợp lệ hoặc nằm ngoài giờ hoạt động (06:00–22:00)!')
        );
    }

    return res.status(200).json(
        createResponse(true, 200, 'Tính tiền thành công!', {
            fieldAmount,
            equipmentTotal: 0,
            discountTotal: 0,
            total: fieldAmount,
            normalHours,
            peakHours,
            totalHours,
        })
    );
});

/**
 * TẠO BOOKING (có hỗ trợ nhiều block slot + order gộp cho online)
 */
export const createBooking = handleAsync(async (req, res, next) => {
    const {
        courtId,
        customerId,
        date,
        startTime,
        endTime,
        paymentMethod,
        note,
        isOffline,
        customerInfo,
        paidAtCreation,
        voucherCode,
        slots,
        totalFieldAmount,
    } = req.body;

    const hasSlotList = Array.isArray(slots) && slots.length > 0;

    if (!courtId || !date || (!startTime && !hasSlotList) || (!endTime && !hasSlotList)) {
        return next(createError(400, 'Thiếu dữ liệu bắt buộc!'));
    }

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    const roleFromToken = (req.user?.role || USER_ROLES.USER).toLowerCase();

    const isOfflineMode =
        isOffline === true || isOffline === 'true' || roleFromToken === USER_ROLES.ADMIN;

    const isOnlineMode =
        !isOfflineMode && [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(paymentMethod);

    const createdBy = isOfflineMode ? USER_ROLES.ADMIN : roleFromToken;

    const finalCustomerId =
        createdBy === USER_ROLES.ADMIN ? customerId || null : req.user?._id || customerId || null;

    const normalizedCustomerInfo = {
        name: customerInfo?.name?.trim() || '',
        phone: customerInfo?.phone?.trim() || '',
        email: customerInfo?.email?.trim() || '',
    };

    let slotGroups = [];

    if (hasSlotList) {
        const cleanedSlots = slots.filter((s) => s && s.startTime && s.endTime);
        if (cleanedSlots.length === 0) {
            return next(createError(400, 'Danh sách ca không hợp lệ!'));
        }
        slotGroups = groupSlotsByContinuous(cleanedSlots);
    } else {
        if (!startTime || !endTime) {
            return next(createError(400, 'Thiếu giờ bắt đầu / kết thúc!'));
        }
        slotGroups = [[{ startTime, endTime }]];
    }

    if (!Array.isArray(slotGroups) || slotGroups.length === 0) {
        return next(createError(400, 'Không tìm thấy khung giờ hợp lệ để đặt sân!'));
    }

    const groupSummaries = [];

    for (const group of slotGroups) {
        const gStart = group[0].startTime;
        const gEnd = group[group.length - 1].endTime;

        let calcResult;
        if (hasSlotList) {
            calcResult = calcFieldPriceFromSlotsList(group, court);
        } else {
            calcResult = calcFieldPriceBySlots(gStart, gEnd, court);
        }

        const { slotCount, fieldAmount, totalHours } = calcResult;

        if (slotCount === 0) {
            return next(
                createError(
                    400,
                    `Khung giờ ${gStart} - ${gEnd} không hợp lệ hoặc nằm ngoài giờ hoạt động!`
                )
            );
        }

        groupSummaries.push({
            startTime: gStart,
            endTime: gEnd,
            slotCount,
            fieldAmount,
            totalHours,
            slots: hasSlotList ? group : undefined,
        });
    }

    if (typeof totalFieldAmount !== 'undefined') {
        const clientFieldAmount = Number(totalFieldAmount);
        const serverFieldAmount = groupSummaries.reduce(
            (sum, g) => sum + Number(g.fieldAmount || 0),
            0
        );
        if (
            typeof clientFieldAmount === 'number' &&
            clientFieldAmount > 0 &&
            Math.abs(clientFieldAmount - serverFieldAmount) >= 1000
        ) {
            console.warn(
                '[createBooking] totalFieldAmount FE:',
                clientFieldAmount,
                ' != server:',
                serverFieldAmount
            );
        }
    }

    const bookingDateObj = new Date(date);
    if (Number.isNaN(bookingDateObj.getTime())) {
        return next(createError(400, 'Ngày đặt không hợp lệ!'));
    }

    const bookingDay = new Date(
        bookingDateObj.getFullYear(),
        bookingDateObj.getMonth(),
        bookingDateObj.getDate()
    );
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const firstStartTime = groupSummaries[0].startTime;
    const [sh, sm] = firstStartTime.split(':').map(Number);
    const bookingStartDateTime = new Date(
        bookingDateObj.getFullYear(),
        bookingDateObj.getMonth(),
        bookingDateObj.getDate(),
        sh,
        sm || 0,
        0,
        0
    );

    const isFutureMatch =
        bookingDay.getTime() > today.getTime() ||
        (bookingDay.getTime() === today.getTime() &&
            bookingStartDateTime.getTime() > now.getTime());

    const day = new Date(bookingDay);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const bookingsSameDay = await Booking.find({
        courtId,
        date: { $gte: day, $lt: nextDay },
        status: { $ne: BOOKING_STATUS.CANCELLED },
    });

    const requestSlots =
        hasSlotList && slots.length > 0
            ? slots
            : [{ startTime: groupSummaries[0].startTime, endTime: groupSummaries[0].endTime }];

    if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay)) {
        return next(createError(400, 'Khung giờ này đã có người đặt!'));
    }

    let voucherPayload = null;
    if (voucherCode) {
        if (!finalCustomerId) {
            return next(createError(400, 'Vui lòng chọn khách hàng để áp dụng voucher!'));
        }

        const primaryGroup = groupSummaries[0];
        const primarySlots = slotGroups[0];

        voucherPayload = await validateVoucherForOrder({
            code: voucherCode,
            userId: finalCustomerId,
            orderTotal: primaryGroup.fieldAmount,
            courtId,
            courtType: court.type,
            bookingDate: date,
            startTime: primaryGroup.startTime,
            slots: hasSlotList ? primarySlots : undefined,
        });
    }

    const voucherDiscount = voucherPayload?.discountAmount || 0;

    const initialStatus = isOfflineMode ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;

    let autoCancelAt = null;
    if (!isOfflineMode && paymentMethod === PAYMENT_METHOD.VNPAY) {
        const expireMinutes = 5;
        autoCancelAt = new Date(Date.now() + expireMinutes * 60 * 1000);
    }

    const createdBookings = [];

    for (let index = 0; index < groupSummaries.length; index++) {
        const summary = groupSummaries[index];
        const isVoucherBooking = index === 0 && !!voucherPayload;

        let initialPaymentStatus = PAYMENT_STATUS.UNPAID;
        let depositAmount = 0;
        let depositStatus = DEPOSIT_STATUS.PENDING;
        let depositMethod = undefined;

        if (isOfflineMode && paymentMethod === PAYMENT_METHOD.CASH) {
            if (isFutureMatch) {
                const paidFlag = paidAtCreation === true || paidAtCreation === 'true';

                if (!paidFlag) {
                    return next(
                        createError(
                            400,
                            'Khách đặt sân đá sau (khác ngày hoặc khác giờ) bắt buộc phải cọc tối thiểu 50% tiền sân!'
                        )
                    );
                }

                depositAmount = Math.round(summary.fieldAmount * 0.5);
                depositStatus = DEPOSIT_STATUS.PAID;
                depositMethod = PAYMENT_METHOD.CASH;

                initialPaymentStatus = PAYMENT_STATUS.PARTIAL;
            } else {
                const paidFlag = paidAtCreation === true || paidAtCreation === 'true';

                if (paidFlag) {
                    initialPaymentStatus = PAYMENT_STATUS.PAID;
                } else {
                    initialPaymentStatus = PAYMENT_STATUS.UNPAID;
                }
            }
        } else {
            initialPaymentStatus = PAYMENT_STATUS.UNPAID;
        }

        const discountForThisBooking = isVoucherBooking ? voucherDiscount : 0;
        const totalForThisBooking = Math.max(0, summary.fieldAmount - discountForThisBooking);

        const booking = await Booking.create({
            code:
                groupSummaries.length === 1
                    ? `BK${Date.now().toString().slice(-6)}`
                    : `BK${Date.now().toString().slice(-6)}${String(index + 1).padStart(2, '0')}`,
            courtId,
            customerId: finalCustomerId,
            customerInfo: normalizedCustomerInfo,
            date,
            startTime: summary.startTime,
            endTime: summary.endTime,
            hours: summary.totalHours,
            fieldAmount: summary.fieldAmount,
            equipmentTotal: 0,
            discountTotal: discountForThisBooking,
            total: totalForThisBooking,
            paymentMethod,
            notes: note || '',
            status: initialStatus,
            slots: summary.slots,
            paymentStatus: initialPaymentStatus,
            createdBy,
            autoCancelAt,
            depositAmount,
            depositStatus,
            depositMethod,
            voucherId: isVoucherBooking ? voucherPayload?.voucher?._id || null : null,
            voucherCode: isVoucherBooking ? voucherPayload?.normalizedCode || '' : '',
            voucherDiscount: isVoucherBooking ? voucherDiscount : 0,
            voucherSnapshot:
                isVoucherBooking && voucherPayload
                    ? {
                          discountType: voucherPayload.voucher.discountType,
                          discountValue: voucherPayload.voucher.discountValue,
                          maxDiscountValue: voucherPayload.voucher.maxDiscountValue,
                          minOrderValue: voucherPayload.voucher.minOrderValue,
                          perUserLimit: voucherPayload.voucher.perUserLimit,
                          startDate: voucherPayload.voucher.startDate,
                          endDate: voucherPayload.voucher.endDate,
                      }
                    : undefined,
            voucherUsageStatus: isVoucherBooking && voucherPayload ? 'pending' : 'none',
        });

        if (isVoucherBooking && initialPaymentStatus === PAYMENT_STATUS.PAID) {
            try {
                const usage = await commitVoucherUsage({
                    voucherId: voucherPayload.voucher._id,
                    bookingId: booking._id,
                    userId: finalCustomerId,
                    discountAmount: voucherDiscount,
                    orderTotal: summary.fieldAmount,
                });
                booking.voucherUsageId = usage._id;
                booking.voucherUsageStatus = 'applied';
                await booking.save();
            } catch (error) {
                await Booking.findByIdAndDelete(booking._id);
                return next(error);
            }
        }

        createdBookings.push(booking);
    }

    // TẠO ORDER GỘP CHO ONLINE NHIỀU BOOKING
    if (createdBookings.length > 1 && isOnlineMode) {
        const totalOrderAmount = createdBookings.reduce(
            (sum, b) => sum + Number(b.total || b.fieldAmount || 0),
            0
        );

        const order = await Order.create({
            code: `OD${Date.now().toString().slice(-6)}`,
            customerId: finalCustomerId,
            bookings: createdBookings.map((b) => b._id),
            total: totalOrderAmount,
            paymentStatus: PAYMENT_STATUS.UNPAID,
            paymentMethod,
            status: 'PENDING',
        });

        await Booking.updateMany(
            { _id: { $in: createdBookings.map((b) => b._id) } },
            { $set: { orderId: order._id } }
        );

        createdBookings.forEach((b) => {
            b.orderId = order._id;
        });
    }

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(courtId)).emit('booking_updated', {
        courtId: String(courtId),
        date: new Date(date).toISOString().slice(0, 10),
    });

    if (createdBookings.length === 1) {
        return res
            .status(201)
            .json(createResponse(true, 201, 'Tạo đơn đặt sân thành công!', createdBookings[0]));
    }

    return res
        .status(201)
        .json(createResponse(true, 201, 'Tạo nhiều đơn đặt sân thành công!', createdBookings));
});

//* Lấy slot theo sân
export const getBookingsByCourt = handleAsync(async (req, res, next) => {
    const { courtId } = req.params;
    const { startDate, endDate } = req.query;

    if (!courtId) {
        return next(createError(400, 'Thiếu courtId!'));
    }

    const filter = {
        courtId,
        status: { $ne: BOOKING_STATUS.CANCELLED },
    };

    if (startDate && endDate) {
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);

        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);

        filter.date = { $gte: from, $lte: to };
    }

    const allBookings = await Booking.find(filter).select(
        'date startTime endTime status slots paymentStatus paymentMethod depositStatus depositAmount createdBy'
    );

    const blockingBookings = allBookings.filter((b) => isBlockingBooking(b));

    return res.json(createResponse(true, 200, 'Danh sách giờ đã được đặt', blockingBookings));
});

//* Hủy booking
export const cancelBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;
    const { reason, internalNote } = req.body;
    const previousStatus = booking.status;

    if (user.role === USER_ROLES.USER) {
        if (String(booking.customerId) !== String(user._id)) {
            return next(createError(403, 'Bạn không có quyền hủy đơn này!'));
        }
        if (booking.status !== BOOKING_STATUS.PENDING) {
            return next(createError(400, 'Chỉ được hủy đơn đang chờ thanh toán/xác nhận!'));
        }

        if (!reason || !reason.trim()) {
            return next(createError(400, 'Vui lòng nhập lý do hủy đơn!'));
        }
    }

    if (
        user.role === USER_ROLES.ADMIN &&
        [BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(booking.status)
    ) {
        return next(createError(400, 'Đơn đang sử dụng/đã hoàn tất, không thể hủy!'));
    }

    booking.status = BOOKING_STATUS.CANCELLED;
    booking.updatedAt = new Date();
    booking.cancelledAt = new Date();

    booking.cancelBy = user.role;

    if (reason && reason.trim()) {
        booking.cancelReason = reason.trim();
    }

    if (user.role === USER_ROLES.ADMIN && internalNote && internalNote.trim()) {
        booking.cancelNote = internalNote.trim();
    }

    const isAdmin = user.role === USER_ROLES.ADMIN;
    const isPaidOrPartial = [PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIAL].includes(
        booking.paymentStatus
    );
    const isOnlinePayment = [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(
        booking.paymentMethod
    );

    if (
        isAdmin &&
        isPaidOrPartial &&
        isOnlinePayment &&
        (!booking.refundStatus || booking.refundStatus === 'none')
    ) {
        booking.refundStatus = 'processing';
        booking.refundAdminReason =
            (internalNote && internalNote.trim()) ||
            (reason && reason.trim()) ||
            'Admin hủy đơn online và đang xử lý hoàn tiền cho khách';
    }

    if (
        booking.voucherUsageId &&
        booking.voucherUsageStatus === 'applied' &&
        ![BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(previousStatus)
    ) {
        await restoreVoucherUsage(booking);
        booking.voucherUsageStatus = 'restored';
        booking.voucherRestoredAt = new Date();
    } else if (booking.voucherUsageStatus === 'pending') {
        booking.voucherUsageStatus = 'none';
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, ' Hủy booking thành công!', booking));
});

/**
 * CREATE MULTI BOOKING (phiên bản cũ cho từng slot đơn)
 * – Bạn vẫn dùng được song song với createBooking mới
 */
export const createMultiBooking = handleAsync(async (req, res, next) => {
    const {
        courtId,
        customerId,
        date,
        timeSlots,
        paymentMethod,
        note,
        isOffline,
        customerInfo,
        paidAtCreation,
    } = req.body;

    if (!courtId || !date || !timeSlots || !Array.isArray(timeSlots) || timeSlots.length === 0) {
        return next(createError(400, 'Thiếu sân, ngày hoặc danh sách khung giờ!'));
    }

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    const roleFromToken = (req.user?.role || USER_ROLES.USER).toLowerCase();
    const isOfflineMode =
        isOffline === true || isOffline === 'true' || roleFromToken === USER_ROLES.ADMIN;
    const createdBy = isOfflineMode ? USER_ROLES.ADMIN : roleFromToken;
    const finalCustomerId =
        createdBy === USER_ROLES.ADMIN ? customerId || null : req.user?._id || customerId || null;

    let initialPaymentStatus = PAYMENT_STATUS.UNPAID;
    if (isOfflineMode && paymentMethod === PAYMENT_METHOD.CASH && paidAtCreation === true) {
        initialPaymentStatus = PAYMENT_STATUS.PAID;
    }

    const createdBookings = [];

    const day = new Date(date);
    if (Number.isNaN(day.getTime())) return next(createError(400, 'Ngày đặt không hợp lệ!'));
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const bookingsSameDay = await Booking.find({
        courtId,
        date: { $gte: day, $lt: nextDay },
        status: { $ne: BOOKING_STATUS.CANCELLED },
    });

    for (const slot of timeSlots) {
        const { startTime, endTime } = slot || {};
        if (!startTime || !endTime) {
            return next(createError(400, 'Mỗi slot phải có startTime và endTime!'));
        }

        const { slotCount, fieldAmount, totalHours } = calcFieldPriceBySlots(
            startTime,
            endTime,
            court
        );

        if (slotCount === 0) {
            return next(
                createError(
                    400,
                    `Khung giờ ${startTime} - ${endTime} không hợp lệ hoặc nằm ngoài giờ hoạt động!`
                )
            );
        }

        const requestSlots = [{ startTime, endTime }];

        if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay)) {
            return next(
                createError(
                    400,
                    `Khung giờ ${startTime} - ${endTime} đã có người đặt trên sân này!`
                )
            );
        }

        bookingsSameDay.push({
            _id: 'temp_' + startTime + '_' + endTime,
            startTime,
            endTime,
            slots: [{ startTime, endTime }],
        });

        const initialStatus = isOfflineMode ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;

        const booking = await Booking.create({
            code: `BK${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
            courtId,
            customerId: finalCustomerId,
            customerInfo: {
                name: customerInfo?.name?.trim() || '',
                phone: customerInfo?.phone?.trim() || '',
                email: customerInfo?.email?.trim() || '',
            },
            date,
            startTime,
            endTime,
            hours: totalHours,
            fieldAmount,
            equipmentTotal: 0,
            discountTotal: 0,
            total: fieldAmount,
            paymentMethod,
            notes: note || '',
            status: initialStatus,
            paymentStatus: initialPaymentStatus,
            createdBy,
        });

        createdBookings.push(booking);

        const io = req.app.get('io');
        io?.emit('booking_global_updated');
        io?.to(String(courtId)).emit('booking_updated', {
            courtId: String(courtId),
            date: new Date(date).toISOString().slice(0, 10),
        });
    }

    return res
        .status(201)
        .json(createResponse(true, 201, 'Tạo booking thành công!', createdBookings));
});

// * ADMIN xác nhận
export const confirmBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    if (booking.status !== BOOKING_STATUS.PENDING) {
        return next(createError(400, 'Chỉ xác nhận đơn đang chờ xác nhận!'));
    }

    booking.status = BOOKING_STATUS.CONFIRMED;
    booking.updatedAt = new Date();
    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Xác nhận booking thành công!', booking));
});

const CHECKIN_BEFORE_MINUTES = 15; // cho check-in trước giờ đá 15p

// * CHECKIN
export const checkinBooking = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;
    const { items = [] } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));
    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
        return next(createError(400, 'Chỉ đơn đã xác nhận mới được check-in'));
    }

    // //  GIỚI HẠN THỜI GIAN CHECK-IN
    // const now = new Date();

    // const bookingDate = new Date(booking.date);
    // if (Number.isNaN(bookingDate.getTime())) {
    //     return next(createError(400, 'Ngày đặt của booking không hợp lệ!'));
    // }

    // // So sánh theo "ngày" (bỏ giờ phút giây)
    // const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // const matchDay = new Date(
    //     bookingDate.getFullYear(),
    //     bookingDate.getMonth(),
    //     bookingDate.getDate()
    // );

    // // Nếu chưa đúng ngày đá -> không cho check-in
    // if (today.getTime() !== matchDay.getTime()) {
    //     return next(
    //         createError(
    //             400,
    //             'Chỉ được check-in trong đúng ngày diễn ra lịch đá (không được check-in trước ngày)!'
    //         )
    //     );
    // }

    // // Lấy giờ bắt đầu sớm nhất của booking (nếu có slots thì dùng slots)
    // let earliestStart = booking.startTime;
    // if (Array.isArray(booking.slots) && booking.slots.length > 0) {
    //     const sortedSlots = [...booking.slots].sort(
    //         (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)
    //     );
    //     earliestStart = sortedSlots[0].startTime;
    // }

    // if (!earliestStart) {
    //     return next(createError(400, 'Booking không có thông tin giờ bắt đầu để check-in!'));
    // }

    // const [sh, sm] = earliestStart.split(':').map(Number);
    // const matchStartDateTime = new Date(
    //     bookingDate.getFullYear(),
    //     bookingDate.getMonth(),
    //     bookingDate.getDate(),
    //     sh || 0,
    //     sm || 0,
    //     0,
    //     0
    // );

    // // Thời điểm được phép bắt đầu check-in = giờ đá - 15 phút
    // const allowFrom = new Date(matchStartDateTime.getTime() - CHECKIN_BEFORE_MINUTES * 60 * 1000);

    // //  Nếu đang check-in trước thời điểm cho phép
    // if (now.getTime() < allowFrom.getTime()) {
    //     const hh = String(allowFrom.getHours()).padStart(2, '0');
    //     const mm = String(allowFrom.getMinutes()).padStart(2, '0');

    //     return next(
    //         createError(
    //             400,
    //             `Chỉ được check-in trước giờ đá tối đa ${CHECKIN_BEFORE_MINUTES} phút (từ ${hh}:${mm} trở đi)!`
    //         )
    //     );
    // }

    // Xóa thiết bị cũ (nếu có) rồi thêm lại theo lần check-in hiện tại
    await BookingItem.deleteMany({ bookingId });

    let equipmentTotalCalc = 0;

    for (const item of items) {
        const { equipmentId, mode, qty, price } = item;
        if (!equipmentId || !qty || qty <= 0) continue;

        const eq = await Equipment.findById(equipmentId);
        if (!eq) {
            return next(createError(404, `Thiết bị không tồn tại`));
        }

        const stockFieldName =
            typeof eq.availableQuantity === 'number'
                ? 'availableQuantity'
                : typeof eq.stockLeft === 'number'
                  ? 'stockLeft'
                  : typeof eq.stock === 'number'
                    ? 'stock'
                    : 'totalQuantity';

        const currentStock = eq[stockFieldName] || 0;

        if (currentStock < qty) {
            return next(
                createError(
                    400,
                    `Thiết bị ${eq.name} không đủ số lượng (còn ${currentStock}, yêu cầu ${qty})`
                )
            );
        }

        const unitPrice =
            typeof price === 'number' && price > 0
                ? price
                : mode === 'sell'
                  ? eq.salePrice
                  : eq.rentPrice;

        const lineSubtotal = unitPrice * qty;
        equipmentTotalCalc += lineSubtotal;

        eq[stockFieldName] = currentStock - qty;
        if (mode === 'rent') {
            eq.rentedQuantity = (eq.rentedQuantity || 0) + qty;
        }
        await eq.save();

        await BookingItem.create({
            bookingId,
            equipmentId,
            mode,
            qty,
            price: unitPrice,
            subtotal: lineSubtotal,
            name: eq.name,
            unit: eq.unit || 'gói',
        });
    }

    booking.status = BOOKING_STATUS.IN_USE;
    booking.equipmentTotal = equipmentTotalCalc;
    booking.total =
        (booking.fieldAmount || 0) + (booking.equipmentTotal || 0) - (booking.discountTotal || 0);
    if (booking.voucherUsageStatus === 'applied') {
        booking.voucherUsageStatus = 'consumed';
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Check-in thành công!', booking));
});

//* CHECKOUT
export const checkoutBooking = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));
    if (booking.status !== BOOKING_STATUS.IN_USE) {
        return next(createError(400, 'Chỉ đơn đang sử dụng mới được check-out'));
    }

    const bookingItems = await BookingItem.find({ bookingId });

    for (const item of bookingItems) {
        if (item.mode !== 'rent') continue;

        const eq = await Equipment.findById(item.equipmentId);
        if (!eq) continue;

        const stockFieldName =
            typeof eq.availableQuantity === 'number'
                ? 'availableQuantity'
                : typeof eq.stockLeft === 'number'
                  ? 'stockLeft'
                  : typeof eq.stock === 'number'
                    ? 'stock'
                    : 'totalQuantity';

        eq[stockFieldName] = (eq[stockFieldName] || 0) + item.qty;

        if (typeof eq.rentedQuantity === 'number') {
            eq.rentedQuantity = Math.max(0, eq.rentedQuantity - item.qty);
        }

        await eq.save();
    }

    booking.status = BOOKING_STATUS.COMPLETED;
    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Check-out thành công!', booking));
});

//* Admin cập nhật thanh toán
export const updateBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const { paymentStatus } = req.body;
    const previousPaymentStatus = booking.paymentStatus;

    if (paymentStatus && Object.values(PAYMENT_STATUS).includes(paymentStatus)) {
        booking.paymentStatus = paymentStatus;

        if (
            paymentStatus === PAYMENT_STATUS.PAID &&
            previousPaymentStatus !== PAYMENT_STATUS.PAID &&
            booking.voucherId &&
            booking.voucherUsageStatus === 'pending' &&
            booking.customerId
        ) {
            try {
                const usage = await commitVoucherUsage({
                    voucherId: booking.voucherId,
                    bookingId: booking._id,
                    userId: booking.customerId,
                    discountAmount: booking.voucherDiscount || 0,
                    orderTotal: booking.fieldAmount || 0,
                });
                booking.voucherUsageId = usage._id;
                booking.voucherUsageStatus = 'applied';
            } catch (error) {
                console.error('❌ Lỗi khi commit voucher trong updateBooking:', error.message);
            }
        }
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');

    return res.json(createResponse(true, 200, 'Cập nhật booking thành công!', booking));
});

//* Admin sửa giờ / sân
export const updateBookingTime = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const admin = req.user;
    if (!admin || admin.role !== USER_ROLES.ADMIN) {
        return next(createError(403, 'Chỉ admin mới được chỉnh sửa đặt sân!'));
    }

    const { courtId, date, startTime, endTime, slots } = req.body;

    if (!courtId || !date) {
        return next(createError(400, 'Thiếu sân hoặc ngày!'));
    }

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    const newDate = new Date(date);
    if (Number.isNaN(newDate.getTime())) {
        return next(createError(400, 'Ngày đặt không hợp lệ!'));
    }

    let usedSlots =
        Array.isArray(slots) && slots.length > 0
            ? slots.filter((s) => s && s.startTime && s.endTime)
            : [];

    let finalStartTime = startTime;
    let finalEndTime = endTime;

    if (usedSlots.length > 0) {
        usedSlots.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
        finalStartTime = usedSlots[0].startTime;
        finalEndTime = usedSlots[usedSlots.length - 1].endTime;
    }

    if (!finalStartTime || !finalEndTime) {
        return next(createError(400, 'Thiếu giờ bắt đầu / kết thúc!'));
    }

    let slotCount, fieldAmount, totalHours;

    if (usedSlots.length > 0) {
        ({ slotCount, fieldAmount, totalHours } = calcFieldPriceFromSlotsList(usedSlots, court));
    } else {
        ({ slotCount, fieldAmount, totalHours } = calcFieldPriceBySlots(
            finalStartTime,
            finalEndTime,
            court
        ));
    }

    if (slotCount === 0) {
        return next(createError(400, 'Khung giờ không hợp lệ hoặc nằm ngoài giờ hoạt động!'));
    }

    const day = new Date(newDate);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const bookingsSameDay = await Booking.find({
        courtId,
        date: { $gte: day, $lt: nextDay },
        status: { $ne: BOOKING_STATUS.CANCELLED },
    });

    const requestSlots =
        usedSlots.length > 0 ? usedSlots : [{ startTime: finalStartTime, endTime: finalEndTime }];

    if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay, booking._id)) {
        return next(createError(400, 'Khung giờ này đã có người đặt!'));
    }

    const oldCourtId = booking.courtId;
    const oldDate = booking.date;

    booking.courtId = courtId;
    booking.date = newDate;
    booking.startTime = finalStartTime;
    booking.endTime = finalEndTime;
    booking.hours = totalHours;
    booking.fieldAmount = fieldAmount;
    booking.equipmentTotal = booking.equipmentTotal || 0;
    booking.discountTotal = booking.discountTotal || 0;
    booking.total = fieldAmount + booking.equipmentTotal - booking.discountTotal;
    booking.updatedAt = new Date();
    booking.slots = usedSlots.length > 0 ? usedSlots : undefined;

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');

    const newDateStr = newDate.toISOString().slice(0, 10);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    io?.to(String(courtId)).emit('booking_updated', {
        courtId: String(courtId),
        date: newDateStr,
    });

    if (String(oldCourtId) !== String(courtId) || oldDateStr !== newDateStr) {
        io?.to(String(oldCourtId)).emit('booking_updated', {
            courtId: String(oldCourtId),
            date: oldDateStr,
        });
    }

    return res.json(createResponse(true, 200, 'Cập nhật giờ / sân thành công!', booking));
});

//* User gửi yêu cầu hoàn tiền
export const requestRefund = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;
    const { accountNumber, accountName, bankName, note } = req.body;

    if (!user || String(booking.customerId) !== String(user._id)) {
        return next(createError(403, 'Bạn không có quyền yêu cầu hoàn tiền cho đơn này!'));
    }

    const allowStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CANCELLED];
    if (!allowStatuses.includes(booking.status)) {
        return next(
            createError(400, 'Chỉ được yêu cầu hoàn tiền cho đơn đang chờ xác nhận hoặc đã hủy!')
        );
    }

    if (booking.status === BOOKING_STATUS.CANCELLED && booking.cancelBy === USER_ROLES.ADMIN) {
        return next(
            createError(
                400,
                'Đơn này đã bị admin hủy, vui lòng liên hệ quản lý để được hỗ trợ hoàn tiền!'
            )
        );
    }

    if (![PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIAL].includes(booking.paymentStatus)) {
        return next(
            createError(400, 'Chỉ được yêu cầu hoàn tiền cho đơn đã thanh toán hoặc đã cọc!')
        );
    }

    if (!['none', 'rejected', undefined, null].includes(booking.refundStatus)) {
        return next(
            createError(400, 'Đơn này đang/đã được xử lý hoàn tiền, không thể gửi lại yêu cầu!')
        );
    }

    if (!accountNumber || !accountName || !bankName) {
        return next(createError(400, 'Vui lòng nhập đầy đủ thông tin tài khoản nhận tiền!'));
    }

    booking.refundAccountNumber = accountNumber.trim();
    booking.refundAccountName = accountName.trim();
    booking.refundBankName = bankName.trim();
    booking.refundNote = note?.trim() || '';
    booking.refundStatus = 'pending';

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(
        createResponse(true, 200, 'Gửi yêu cầu hoàn tiền thành công! Vui lòng chờ xử lý.', booking)
    );
});

//* Admin cập nhật trạng thái hoàn tiền (dùng cho pending/processing)
export const updateRefundStatus = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const admin = req.user;
    if (!admin || admin.role !== USER_ROLES.ADMIN) {
        return next(createError(403, 'Chỉ admin mới được cập nhật trạng thái hoàn tiền!'));
    }

    const { status, note, markPaymentRefunded } = req.body;
    const allowed = ['pending', 'processing', 'refunded', 'rejected'];

    if (!allowed.includes(status)) {
        return next(createError(400, 'Trạng thái hoàn tiền không hợp lệ!'));
    }

    const current = booking.refundStatus || 'pending';

    const FLOW = {
        pending: ['pending', 'processing'],
        processing: ['processing', 'refunded', 'rejected'],
        refunded: ['refunded'],
        rejected: ['rejected'],
    };

    const allowedNext = FLOW[current] || [];

    if (!allowedNext.includes(status)) {
        return next(
            createError(
                400,
                `Không thể chuyển trực tiếp từ trạng thái "${current}" sang "${status}"!`
            )
        );
    }

    booking.refundStatus = status;

    if (note && note.trim()) {
        booking.refundNote = note.trim();
    }

    if (status === 'refunded' && markPaymentRefunded !== false) {
        booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Cập nhật hoàn tiền thành công!', booking));
});

//* DASHBOARD ADMIN
export const getAdminDashboardBookings = handleAsync(async (req, res, next) => {
    const [total, pending, confirmed, inUse, completed, cancelled] = await Promise.all([
        Booking.countDocuments(),
        Booking.countDocuments({ status: BOOKING_STATUS.PENDING }),
        Booking.countDocuments({ status: BOOKING_STATUS.CONFIRMED }),
        Booking.countDocuments({ status: BOOKING_STATUS.IN_USE }),
        Booking.countDocuments({ status: BOOKING_STATUS.COMPLETED }),
        Booking.countDocuments({ status: BOOKING_STATUS.CANCELLED }),
    ]);

    return res.json(
        createResponse(true, 200, 'Thống kê booking thành công!', {
            total,
            pending,
            confirmed,
            inUse,
            completed,
            cancelled,
        })
    );
});

//* GET ALL (ADMIN + USER)
export const getBookings = handleAsync(async (req, res, next) => {
    const role = req.user?.role;
    const baseFilter = role === USER_ROLES.ADMIN ? {} : { customerId: req.user._id };

    const bookings = await Booking.find(baseFilter)
        .populate('courtId', 'name type images image address')
        .populate('customerId', 'name username phone email')
        .populate('voucherId', 'code discountType discountValue maxDiscountValue')
        .sort({ createdAt: -1 })
        .lean();

    return res.json(createResponse(true, 200, 'Lấy danh sách booking thành công!', bookings));
});

//* GET BY USER
export const getBookingsByUser = handleAsync(async (req, res, next) => {
    const userId = req.params.userId || req.user?._id;
    if (!userId) return next(createError(400, 'Thiếu userId!'));

    //  Lấy list booking như cũ
    const bookings = await Booking.find({ customerId: userId })
        .populate('courtId', 'name type images image address')
        .populate('customerId', 'name username phone email')
        .populate('voucherId', 'code discountType discountValue maxDiscountValue')
        .sort({ createdAt: -1 })
        .lean();

    //  Lấy tất cả BookingItem của các booking đó
    const bookingIds = bookings.map((b) => b._id);
    const items = await BookingItem.find({ bookingId: { $in: bookingIds } })
        .select('bookingId name mode qty price subtotal unit')
        .lean();

    //  Gom item theo bookingId
    const itemsByBooking = {};
    for (const it of items) {
        const key = String(it.bookingId);
        if (!itemsByBooking[key]) itemsByBooking[key] = [];
        itemsByBooking[key].push({
            name: it.name,
            mode: it.mode, // 'rent' | 'sell'
            qty: it.qty,
            unit: it.unit,
            price: it.price,
            subtotal: it.subtotal,
        });
    }

    // Gắn thêm field equipmentItems vào từng booking
    const result = bookings.map((b) => ({
        ...b,
        equipmentItems: itemsByBooking[String(b._id)] || [],
    }));

    return res.json(
        createResponse(true, 200, 'Lấy danh sách booking của người dùng thành công!', result)
    );
});

// * Lấy thông tin để thanh toán lại (booking lẻ HOẶC đơn gộp)
export const getRetryPaymentInfo = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId)
        .populate('courtId', 'name type images image address')
        .populate('customerId', 'name username phone email')
        .lean();

    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;

    if (
        user?.role === USER_ROLES.USER &&
        String(booking.customerId?._id || booking.customerId) !== String(user._id)
    ) {
        return next(createError(403, 'Bạn không có quyền thanh toán lại đơn này!'));
    }

    if (booking.status !== BOOKING_STATUS.PENDING) {
        return next(
            createError(400, 'Chỉ được thanh toán lại cho đơn đang chờ thanh toán/xác nhận!')
        );
    }

    if (booking.paymentMethod !== PAYMENT_METHOD.VNPAY) {
        return next(
            createError(
                400,
                'Đơn này không thanh toán bằng VNPay nên không thể thanh toán lại online!'
            )
        );
    }

    if ([PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(booking.paymentStatus)) {
        return next(
            createError(
                400,
                'Đơn này đã thanh toán đủ hoặc đã hoàn tiền, không thể thanh toán lại!'
            )
        );
    }

    const checkSlotAvailable = async (b) => {
        const day = new Date(b.date);
        if (Number.isNaN(day.getTime())) return;

        day.setHours(0, 0, 0, 0);
        const nextDay = new Date(day);
        nextDay.setDate(day.getDate() + 1);

        const bookingsSameDay = await Booking.find({
            courtId: b.courtId,
            date: { $gte: day, $lt: nextDay },
            status: { $ne: BOOKING_STATUS.CANCELLED },
            _id: { $ne: b._id },
        }).lean();

        const requestSlots =
            Array.isArray(b.slots) && b.slots.length > 0
                ? b.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
                : [{ startTime: b.startTime, endTime: b.endTime }];

        if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay)) {
            const dateStr = new Date(b.date).toLocaleDateString('vi-VN');
            const timeStr = requestSlots.map((s) => `${s.startTime} - ${s.endTime}`).join(', ');

            throw createError(
                400,
                `Khung giờ ${timeStr} ngày ${dateStr} đã được khách khác thanh toán trước. Đơn của bạn không thể thanh toán lại, vui lòng đặt sân mới hoặc chọn khung giờ khác.`
            );
        }
    };

    if (booking.orderId) {
        const order = await Order.findById(booking.orderId).lean();
        if (!order) {
            console.warn('[getRetryPaymentInfo] orderId tồn tại nhưng không tìm thấy Order');
        } else {
            const orderBookings = await Booking.find({ orderId: booking.orderId }).lean();

            const payableBookings = orderBookings.filter(
                (b) =>
                    b.status === BOOKING_STATUS.PENDING &&
                    ![PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(b.paymentStatus)
            );

            if (payableBookings.length === 0) {
                return next(
                    createError(
                        400,
                        'Tất cả các ca trong đơn này đã được thanh toán hoặc hoàn tiền!'
                    )
                );
            }

            for (const b of payableBookings) {
                await checkSlotAvailable(b);
            }

            const total = payableBookings.reduce(
                (sum, b) => sum + Number(b.total || b.fieldAmount || 0),
                0
            );

            const depositPaid = payableBookings.reduce((sum, b) => {
                if (b.depositStatus === DEPOSIT_STATUS.PAID) {
                    return sum + Number(b.depositAmount || 0);
                }
                return sum;
            }, 0);

            const amountToPay = Math.max(0, total - depositPaid);
            if (amountToPay <= 0) {
                return next(createError(400, 'Đơn này đã thanh toán đủ tiền!'));
            }

            return res.json(
                createResponse(true, 200, 'Lấy thông tin thanh toán lại thành công!', {
                    type: 'order',
                    orderId: order._id,
                    bookingIds: payableBookings.map((b) => b._id),
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                    total,
                    paidAmount: depositPaid,
                    amountToPay,
                    court: booking.courtId,
                    customer: booking.customerId,
                    date: booking.date,
                })
            );
        }
    }

    await checkSlotAvailable(booking);

    const total = Number(booking.total || booking.fieldAmount || 0);

    const depositPaid =
        booking.depositStatus === DEPOSIT_STATUS.PAID ? Number(booking.depositAmount || 0) : 0;

    const amountToPay = Math.max(0, total - depositPaid);

    if (amountToPay <= 0) {
        return next(createError(400, 'Đơn này đã thanh toán đủ tiền!'));
    }

    return res.json(
        createResponse(true, 200, 'Lấy thông tin thanh toán lại thành công!', {
            type: 'booking',
            bookingId: booking._id,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            total,
            paidAmount: depositPaid,
            amountToPay,
            court: booking.courtId,
            customer: booking.customerId,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
        })
    );
});

//*từ chối hoàn tiền
export const rejectRefundBooking = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

    if (booking.refundStatus !== 'processing') {
        return next(createError(400, 'Chỉ xử lý đơn đang ở trạng thái "Đang hoàn tiền"!'));
    }

    booking.refundStatus = 'rejected';
    booking.refundAdminReason = reason || '';
    booking.refundProcessedAt = new Date();

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    if (booking.customerId) {
        io?.to(String(booking.customerId)).emit('booking_refund_updated', {
            bookingId: booking._id,
        });
    }

    return res.status(200).json(createResponse(true, 200, 'Đã từ chối yêu cầu hoàn tiền', booking));
});

//* hoàn tiền xong (upload bill)
export const completeRefundBooking = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const { billImage } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

    if (booking.refundStatus !== 'processing') {
        return next(
            createError(400, 'Chỉ hoàn tiền xong cho đơn đang ở trạng thái "Đang hoàn tiền"!')
        );
    }

    if (!billImage) {
        return next(createError(400, 'Thiếu link ảnh hoá đơn hoàn tiền'));
    }

    booking.refundStatus = 'refunded';
    booking.refundBillImage = billImage;
    booking.refundProcessedAt = new Date();

    booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    if (booking.depositAmount > 0) {
        booking.depositStatus = DEPOSIT_STATUS.REFUNDED;
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    if (booking.customerId) {
        io?.to(String(booking.customerId)).emit('booking_refund_updated', {
            bookingId: booking._id,
        });
    }

    return res
        .status(200)
        .json(createResponse(true, 200, 'Đã cập nhật hoàn tiền thành công', booking));
});

// * Thuê thêm thiết bị khi đang sử dụng
export const addEquipmentsBooking = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;
    const { items = [], equipmentTotal } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

    if (booking.status !== BOOKING_STATUS.IN_USE) {
        return next(createError(400, 'Chỉ đơn đang sử dụng mới được thêm thiết bị'));
    }

    let equipmentTotalCalc = 0;

    for (const item of items) {
        const { equipmentId, mode, qty, price } = item;
        const realQty = Number(qty || 0);
        if (!equipmentId || realQty <= 0) continue;

        const eq = await Equipment.findById(equipmentId);
        if (!eq) {
            return next(createError(404, `Thiết bị không tồn tại`));
        }

        const stockFieldName =
            typeof eq.availableQuantity === 'number'
                ? 'availableQuantity'
                : typeof eq.stockLeft === 'number'
                  ? 'stockLeft'
                  : typeof eq.stock === 'number'
                    ? 'stock'
                    : 'totalQuantity';

        const currentStock = eq[stockFieldName] || 0;
        if (currentStock < realQty) {
            return next(
                createError(
                    400,
                    `Thiết bị ${eq.name} không đủ số lượng (còn ${currentStock}, yêu cầu ${realQty})`
                )
            );
        }

        const unitPrice =
            typeof price === 'number' && price > 0
                ? price
                : mode === 'sell'
                  ? eq.salePrice
                  : eq.rentPrice;

        const lineSubtotal = unitPrice * realQty;
        equipmentTotalCalc += lineSubtotal;

        eq[stockFieldName] = currentStock - realQty;
        if (mode === 'rent') {
            eq.rentedQuantity = (eq.rentedQuantity || 0) + realQty;
        }

        await BookingItem.create({
            bookingId,
            equipmentId,
            mode,
            qty: realQty,
            price: unitPrice,
            subtotal: lineSubtotal,
            name: eq.name,
            unit: eq.unit || 'cái',
        });
        await eq.save();
    }

    const addTotal =
        typeof equipmentTotal === 'number' ? Number(equipmentTotal) : Number(equipmentTotalCalc);
    booking.equipmentTotal = (booking.equipmentTotal || 0) + addTotal;
    booking.total = (booking.fieldAmount || 0) + booking.equipmentTotal - booking.discountTotal;

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Đã thêm thiết bị cho đơn đang sử dụng!', booking));
});

// * Admin xem chi tiết booking + thiết bị
export const getBookingDetailAdmin = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId)
        .populate('courtId', 'name type images address')
        .populate('customerId', 'name username phone email')
        .lean();

    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

    const items = await BookingItem.find({ bookingId })
        .select('name mode qty price subtotal unit')
        .lean();

    return res.json(
        createResponse(true, 200, 'Lấy chi tiết booking thành công!', {
            booking,
            items,
        })
    );
});

// * Lấy danh sách thiết bị của 1 booking (cho modal Xem chi tiết / Thêm thiết bị)
export const getBookingEquipmentsDetail = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;

    const items = await BookingItem.find({ bookingId }).populate('equipmentId', 'name unit').lean();

    if (!items) {
        return next(createError(404, 'Không tìm thấy thiết bị cho đơn này!'));
    }

    return res.json(
        createResponse(true, 200, 'Lấy danh sách thiết bị của booking thành công!', items)
    );
});

// * ADMIN hủy đơn thanh toán tiền mặt (COD / cọc tại quầy)
export const adminCancelCashBooking = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const { refundDeposit, adminReason } = req.body;

    const admin = req.user;
    if (!admin || admin.role !== USER_ROLES.ADMIN) {
        return next(createError(403, 'Chỉ admin mới được hủy đơn tiền mặt!'));
    }

    const booking = await Booking.findById(id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    if ([BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
        return next(createError(400, 'Đơn đang sử dụng/đã hoàn tất, không thể hủy!'));
    }

    if (booking.paymentMethod !== PAYMENT_METHOD.CASH) {
        return next(
            createError(
                400,
                'API này chỉ dùng cho đơn thanh toán tiền mặt/COD. Đơn online dùng luồng hoàn tiền riêng!'
            )
        );
    }

    if (booking.depositAmount > 0 && booking.depositStatus === DEPOSIT_STATUS.PAID) {
        if (refundDeposit) {
            booking.depositStatus = DEPOSIT_STATUS.REFUNDED;
            booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
            booking.refundStatus = 'refunded';
            booking.refundProcessedAt = new Date();
            booking.refundAdminReason =
                adminReason?.trim() ||
                'Admin hủy đơn thanh toán tiền mặt và đã trả lại tiền cọc cho khách';
        } else {
            booking.refundStatus = booking.refundStatus || 'none';
            booking.refundAdminReason =
                adminReason?.trim() || 'Admin hủy đơn, admin giữ tiền cọc theo chính sách hủy sân';
        }
    } else if (booking.depositAmount === 0 && booking.paymentStatus === PAYMENT_STATUS.PAID) {
        if (refundDeposit) {
            booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
            booking.refundStatus = 'refunded';
            booking.refundProcessedAt = new Date();
            booking.refundAdminReason =
                adminReason?.trim() ||
                'Admin hủy đơn thanh toán tiền mặt và đã hoàn lại toàn bộ tiền cho khách';
        } else {
            booking.refundStatus = booking.refundStatus || 'none';
            booking.refundAdminReason =
                adminReason?.trim() || 'Admin hủy đơn, CLB không hoàn tiền (theo chính sách)';
        }
    } else {
        booking.refundStatus = booking.refundStatus || 'none';
        if (adminReason?.trim()) {
            booking.refundAdminReason = adminReason.trim();
        }
    }

    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelledAt = new Date();
    booking.updatedAt = new Date();
    booking.cancelBy = USER_ROLES.ADMIN;

    if (adminReason?.trim()) {
        booking.cancelReason = adminReason.trim();
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(
        createResponse(
            true,
            200,
            'Admin đã hủy đơn tiền mặt và cập nhật trạng thái hoàn tiền',
            booking
        )
    );
});
