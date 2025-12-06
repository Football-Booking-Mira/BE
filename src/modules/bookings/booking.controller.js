import {
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHOD,
    USER_ROLES,
    DEPOSIT_STATUS,
} from '../../common/constants/enums.js';
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
        slots.push({ start, end }); // mỗi phần tử = 1 CA 60'
        current += SLOT_DURATION + BREAK_DURATION; // + 15' nghỉ
    }
    return slots;
};

const TIME_SLOTS = generateTimeSlots();

/*
 * Tính tiền sân theo SỐ CA (không tính 15 phút nghỉ)
 * Mỗi ca 60 phút nếu bắt đầu >= 16h thì dùng peakPrice, ngược lại basePrice.
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

    // * kẹp trong khung mở cửa
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

        /*
         * chỉ lấy những CA nằm trọn trong khoảng [realStart, realEnd]
         */
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

    const totalHours = slotCount; // mỗi ca = 1 giờ
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
 * Mỗi phần tử: { startTime, endTime }
 * - Mỗi slot phải khớp đúng 1 ca 60' trong TIME_SLOTS
 * - Không tin giá FE gửi, server tự tính theo basePrice / peakPrice
 */
const calcFieldPriceFromSlotsList = (rawSlots = [], court) => {
    if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
        return { slotCount: 0, fieldAmount: 0, totalHours: 0 };
    }

    let fieldAmount = 0;
    let totalHours = 0;
    let slotCount = 0;

    for (const s of rawSlots) {
        if (!s || !s.startTime || !s.endTime) {
            throw createError(400, 'Slot không hợp lệ (thiếu startTime / endTime)!');
        }

        // dùng lại logic sẵn có, nhưng theo từng ca 60'
        const {
            slotCount: c,
            fieldAmount: fa,
            totalHours: th,
        } = calcFieldPriceBySlots(s.startTime, s.endTime, court);

        // mỗi slot FE gửi lên phải map đúng 1 ca 60'
        if (c !== 1) {
            throw createError(
                400,
                `Khung giờ ${s.startTime} - ${s.endTime} không hợp lệ hoặc không phải 1 ca 60 phút!`
            );
        }

        fieldAmount += fa;
        totalHours += th;
        slotCount += c;
    }

    return { slotCount, fieldAmount, totalHours };
};

//* Tính tiền theo ca
export const calculateBookingPrice = handleAsync(async (req, res, next) => {
    const { courtId, startTime, endTime } = req.query;
    if (!courtId || !startTime || !endTime)
        return next(createError(400, 'Thiếu dữ liệu để tính tiền!'));

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

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

//* Tạo booking
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

    if (!courtId || !date || !startTime || !endTime) {
        return next(createError(400, 'Thiếu dữ liệu bắt buộc!'));
    }

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    // Lấy role từ JWT (nếu có), mặc định là user
    const roleFromToken = (req.user?.role || USER_ROLES.USER).toLowerCase();

    //  Xác định đơn tạo tại quầy:
    const isOfflineMode =
        isOffline === true || isOffline === 'true' || roleFromToken === USER_ROLES.ADMIN;
    //Đơn đặt ONLINE (user đặt trên web, thanh toán VNPAY / Momo)
    const isOnlineMode =
        !isOfflineMode && [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(paymentMethod);

    // Người tạo đơn
    const createdBy = isOfflineMode ? USER_ROLES.ADMIN : roleFromToken;

    // Khách hàng gắn vào booking
    const finalCustomerId =
        createdBy === USER_ROLES.ADMIN ? customerId || null : req.user?._id || customerId || null;

    // Chuẩn hóa thông tin khách hàng
    const normalizedCustomerInfo = {
        name: customerInfo?.name?.trim() || '',
        phone: customerInfo?.phone?.trim() || '',
        email: customerInfo?.email?.trim() || '',
    };

    //  xem có phải đặt nhiều ca không
    const hasSlotList = Array.isArray(slots) && slots.length > 0;
    const isMultiSlots = Array.isArray(slots) && slots.length > 1;

    let slotCount;
    let fieldAmount;
    let totalHours;

    if (hasSlotList) {
        //  tính tiền đúng theo từng ca đã chọn
        const clientFieldAmount = Number(totalFieldAmount);

        const result = calcFieldPriceFromSlotsList(slots, court);

        slotCount = result.slotCount;
        fieldAmount = result.fieldAmount;
        totalHours = result.totalHours;

        // (không bắt buộc) log nếu FE gửi totalFieldAmount khác server tính
        if (
            typeof clientFieldAmount === 'number' &&
            clientFieldAmount > 0 &&
            Math.abs(clientFieldAmount - fieldAmount) >= 1000
        ) {
            console.warn(
                '[createBooking] totalFieldAmount FE:',
                clientFieldAmount,
                ' != server:',
                fieldAmount
            );
        }
    } else {
        // Flow cũ: đặt 1 block liên tục startTime → endTime
        ({ slotCount, fieldAmount, totalHours } = calcFieldPriceBySlots(startTime, endTime, court));
    }

    if (slotCount === 0) {
        return next(createError(400, 'Khung giờ không hợp lệ hoặc nằm ngoài giờ hoạt động!'));
    }
    // Xử lý ngày và giờ đá
    const bookingDateObj = new Date(date);
    if (Number.isNaN(bookingDateObj.getTime())) {
        return next(createError(400, 'Ngày đặt không hợp lệ!'));
    }
    // Ngàu 00:00 giờ bôking
    const bookingDay = new Date(
        bookingDateObj.getFullYear(),
        bookingDateObj.getMonth(),
        bookingDateObj.getDate()
    );
    // thời gian hiện tại
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // giờ bắt đầu trận đấu (ghép date + startTime)
    const [sh, sm] = startTime.split(':').map(Number);
    const bookingStartDateTime = new Date(
        bookingDateObj.getFullYear(),
        bookingDateObj.getMonth(),
        bookingDateObj.getDate(),
        sh,
        sm || 0,
        0,
        0
    );
    // Trận đá tương lai
    //  - Khác ngày: bookingDay > today
    //  - Hoặc cùng ngày nhưng giờ bắt đầu > bây giờ (VD: sáng đặt chiều đá)
    const isFutureMatch =
        bookingDay.getTime() > today.getTime() ||
        (bookingDay.getTime() === today.getTime() &&
            bookingStartDateTime.getTime() > now.getTime());
    let initialPaymentStatus = PAYMENT_STATUS.UNPAID;
    let depositAmount = 0;
    let depositStatus = DEPOSIT_STATUS.PENDING;
    let depositMethod = undefined;

    // ĐƠN TẠI QUẦY (OFFLINE + CASH)
    if (isOfflineMode && paymentMethod === PAYMENT_METHOD.CASH) {
        if (isFutureMatch) {
            // Khách đặt KHÁC NGÀY hoặc SÁNG ĐẶT CHIỀU ĐÁ:
            //    => BẮT BUỘC phải cọc tối thiểu 50%
            const paidFlag = paidAtCreation === true || paidAtCreation === 'true';

            if (!paidFlag) {
                return next(
                    createError(
                        400,
                        'Khách đặt sân đá sau (khác ngày hoặc khác giờ) bắt buộc phải cọc tối thiểu 50% tiền sân!'
                    )
                );
            }

            // Tự set cọc 50%
            depositAmount = Math.round(fieldAmount * 0.5);
            depositStatus = DEPOSIT_STATUS.PAID;
            depositMethod = PAYMENT_METHOD.CASH;

            // Mới thanh toán 1 phần (cọc) => PARTIAL
            initialPaymentStatus = PAYMENT_STATUS.PARTIAL;
        } else {
            //  Đặt và đá GẦN NHƯ NGAY LẬP TỨC (cùng ngày và giờ bắt đầu <= hiện tại)
            const paidFlag = paidAtCreation === true || paidAtCreation === 'true';

            if (paidFlag) {
                // Thu đủ luôn
                initialPaymentStatus = PAYMENT_STATUS.PAID;
            } else {
                // Chưa thu đồng nào
                initialPaymentStatus = PAYMENT_STATUS.UNPAID;
            }
        }
    } else {
        //  Các trường hợp còn lại (ONLINE, chuyển khoản,...)
        initialPaymentStatus = PAYMENT_STATUS.UNPAID;
    }

    // Check trùng giờ (không tính đơn đã hủy)
    const day = new Date(bookingDay);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const hasOverlap = await Booking.findOne({
        courtId,
        date: { $gte: day, $lt: nextDay },
        status: { $ne: BOOKING_STATUS.CANCELLED },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
    });

    if (hasOverlap) {
        return next(createError(400, 'Khung giờ này đã có người đặt!'));
    }

    let voucherPayload = null;
    if (voucherCode) {
        if (isMultiSlots) {
            return next(
                createError(
                    400,
                    'Voucher chỉ áp dụng khi đặt 1 ca. Vui lòng đặt từng ca riêng lẻ nếu muốn dùng voucher!'
                )
            );
        }

        if (!finalCustomerId) {
            return next(createError(400, 'Vui lòng chọn khách hàng để áp dụng voucher!'));
        }

        voucherPayload = await validateVoucherForOrder({
            code: voucherCode,
            userId: finalCustomerId,
            orderTotal: fieldAmount,
            courtId,
            courtType: court.type,
            bookingDate: date,
            startTime,
        });
    }

    const voucherDiscount = voucherPayload?.discountAmount || 0;

    const initialStatus = isOfflineMode ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;

    //* tự hủy đơn sau 5 phú đơn không thanh toán lại
    let autoCancelAt = null;

    if (!isOfflineMode && paymentMethod === PAYMENT_METHOD.VNPAY) {
        const expireMinutes = 5; // tự hủy sau 5 phút
        autoCancelAt = new Date(Date.now() + expireMinutes * 60 * 1000);
    }
    const booking = await Booking.create({
        code: `BK${Date.now().toString().slice(-6)}`,
        courtId,
        customerId: finalCustomerId,
        customerInfo: normalizedCustomerInfo,
        date,
        startTime,
        endTime,
        hours: totalHours,
        fieldAmount,
        equipmentTotal: 0,
        discountTotal: voucherDiscount,
        total: Math.max(0, fieldAmount - voucherDiscount),
        paymentMethod,
        notes: note || '',
        status: initialStatus,
        slots: hasSlotList ? slots : undefined,
        paymentStatus: initialPaymentStatus,
        createdBy, // 'admin' hoặc 'user'
        autoCancelAt,
        //Thoong tin cọc
        depositAmount,
        depositStatus,
        depositMethod,
        voucherId: voucherPayload?.voucher?._id || null,
        voucherCode: voucherPayload?.normalizedCode || '',
        voucherDiscount,
        voucherSnapshot: voucherPayload
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
        // CHỈ lưu thông tin voucher, CHƯA commit voucher usage
        // - Online booking: Voucher sẽ được commit ở createVnpayPayment (first-come-first-served)
        // - Offline booking đã thanh toán đủ: Voucher sẽ được commit ngay ở đây
        voucherUsageStatus: voucherPayload ? 'pending' : 'none',
    });

    // ⭐ COMMIT VOUCHER NGAY nếu đơn offline đã thanh toán đủ (PAID)
    // Với online booking, voucher sẽ được commit ở createVnpayPayment (khi bấm "Hoàn tất thanh toán")
    if (voucherPayload && initialPaymentStatus === PAYMENT_STATUS.PAID) {
        try {
            const usage = await commitVoucherUsage({
                voucherId: voucherPayload.voucher._id,
                bookingId: booking._id,
                userId: finalCustomerId,
                discountAmount: voucherDiscount,
                orderTotal: fieldAmount,
            });
            booking.voucherUsageId = usage._id;
            booking.voucherUsageStatus = 'applied';
            await booking.save();
        } catch (error) {
            await Booking.findByIdAndDelete(booking._id);
            return next(error);
        }
    }

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(courtId)).emit('booking_updated', {
        courtId: String(courtId),
        date: new Date(date).toISOString().slice(0, 10),
    });

    return res.status(201).json(createResponse(true, 201, 'Tạo đơn đặt sân thành công!', booking));
});

//* Lấy slot theo sân
export const getBookingsByCourt = handleAsync(async (req, res, next) => {
    const { courtId } = req.params;
    const { startDate, endDate } = req.query;

    if (!courtId) {
        return next(createError(400, 'Thiếu courtId!'));
    }

    // Bất kỳ booking nào KHÔNG bị hủy đều chặn slot (pending, confirmed, in_use, completed...)
    const filter = {
        courtId,
        status: { $ne: BOOKING_STATUS.CANCELLED },
    };

    // Nếu FE truyền startDate & endDate (yyyy-mm-dd)
    if (startDate && endDate) {
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);

        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);

        filter.date = { $gte: from, $lte: to };
    }

    const bookings = await Booking.find(filter).select('date startTime endTime status slots');

    return res.json(createResponse(true, 200, 'Danh sách giờ đã được đặt', bookings));
});

//* Hủy booking
export const cancelBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;
    const { reason, internalNote } = req.body;
    const previousStatus = booking.status;

    //* USER: chỉ được hủy đơn của mình và đang PENDING
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

    //* ADMIN: không được hủy khi đang sử dụng hoặc đã hoàn thành
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

    // ⭐ CHỈ restore voucher nếu đã commit (status = "applied")
    // Nếu voucher chưa commit (status = "pending"), không cần restore vì chưa bị trừ lượt
    if (
        booking.voucherUsageId &&
        booking.voucherUsageStatus === 'applied' &&
        ![BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(previousStatus)
    ) {
        await restoreVoucherUsage(booking);
        booking.voucherUsageStatus = 'restored';
        booking.voucherRestoredAt = new Date();
    } else if (booking.voucherUsageStatus === 'pending') {
        // Nếu voucher chưa commit, chỉ cần reset status về "none"
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

    // Lấy role từ JWT (nếu có), mặc định là user
    const roleFromToken = (req.user?.role || USER_ROLES.USER).toLowerCase();
    const isOfflineMode =
        isOffline === true || isOffline === 'true' || roleFromToken === USER_ROLES.ADMIN;
    const createdBy = isOfflineMode ? USER_ROLES.ADMIN : roleFromToken;
    const finalCustomerId =
        createdBy === USER_ROLES.ADMIN ? customerId || null : req.user?._id || customerId || null;

    // Trạng thái thanh toán ban đầu
    let initialPaymentStatus = PAYMENT_STATUS.UNPAID;
    if (
        isOfflineMode && // đơn tại quầy
        paymentMethod === PAYMENT_METHOD.CASH &&
        paidAtCreation === true // đã thu tiền luôn
    ) {
        initialPaymentStatus = PAYMENT_STATUS.PAID;
    }

    const createdBookings = [];

    // chuẩn hóa ngày để query theo ngày (set giờ về 00:00)
    const day = new Date(date);
    if (Number.isNaN(day.getTime())) return next(createError(400, 'Ngày đặt không hợp lệ!'));
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    for (const slot of timeSlots) {
        const { startTime, endTime } = slot || {};
        if (!startTime || !endTime) {
            return next(createError(400, 'Mỗi slot phải có startTime và endTime!'));
        }

        // Tính tiền & slot count theo ca
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

        // Kiểm tra trùng giờ cho slot hiện tại
        const hasOverlap = await Booking.findOne({
            courtId,
            date: { $gte: day, $lt: nextDay },
            status: { $ne: BOOKING_STATUS.CANCELLED },
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
        });

        if (hasOverlap) {
            return next(
                createError(
                    400,
                    `Khung giờ ${startTime} - ${endTime} đã có người đặt trên sân này!`
                )
            );
        }

        // status ban đầu
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

        // emit realtime cho sân / admin
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

// * Checkin
export const checkinBooking = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;
    const { items = [] } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));
    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
        return next(createError(400, 'Chỉ đơn đã xác nhận mới được check-in'));
    }

    //* Không cho checkin trước ngày đá
    //* booking.date có thể là Date hoặc string, ép sang Date rồi so theo ngày
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); //giờ checkin
    const bookingDateObj = new Date(booking.date);
    const bookingDate = new Date(
        bookingDateObj.getFullYear(),
        bookingDateObj.getMonth(),
        bookingDateObj.getDate()
    ); //*00:00 Đặt sân
    if (bookingDate.getTime() > today.getTime()) {
        return next(
            createError(
                400,
                `Không thể check-in trước ngày đá. Chỉ được check-in từ 00:00 ngày ${bookingDate.toLocaleDateString(
                    'vi-VN'
                )} `
            )
        );
    }

    //* Xóa booking_items cũ (nếu có) rồi tạo lại
    await BookingItem.deleteMany({ bookingId });

    let equipmentTotalCalc = 0;

    //* Xử lý từng thiết bị
    for (const item of items) {
        const { equipmentId, mode, qty, price } = item;
        if (!equipmentId || !qty || qty <= 0) continue;

        const eq = await Equipment.findById(equipmentId);
        if (!eq) {
            return next(createError(404, `Thiết bị không tồn tại`));
        }

        //* field tồn kho đang dùng
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

        //* Đơn giá: ưu tiên lấy từ FE, fallback theo mode
        const unitPrice =
            typeof price === 'number' && price > 0
                ? price
                : mode === 'sell'
                  ? eq.salePrice
                  : eq.rentPrice;

        const lineSubtotal = unitPrice * qty;
        equipmentTotalCalc += lineSubtotal;

        //* Trừ kho
        eq[stockFieldName] = currentStock - qty;
        if (mode === 'rent') {
            eq.rentedQuantity = (eq.rentedQuantity || 0) + qty;
        }
        await eq.save();

        // Lưu booking_item kèm TÊN + ĐƠN VỊ
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

    // Cập nhật tiền thiết bị + tổng tiền đơn
    booking.status = BOOKING_STATUS.IN_USE;
    booking.equipmentTotal = equipmentTotalCalc;
    booking.total =
        (booking.fieldAmount || 0) + (booking.equipmentTotal || 0) - (booking.discountTotal || 0);
    if (booking.voucherUsageStatus === 'applied') {
        booking.voucherUsageStatus = 'consumed';
    }

    await booking.save();

    // realtime
    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Check-in thành công!', booking));
});

//* checkout
export const checkoutBooking = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));
    if (booking.status !== BOOKING_STATUS.IN_USE) {
        return next(createError(400, 'Chỉ đơn đang sử dụng mới được check-out'));
    }

    const bookingItems = await BookingItem.find({ bookingId });

    for (const item of bookingItems) {
        if (item.mode !== 'rent') continue; // chỉ hoàn lại kho cho thuê

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

    // emit realtime
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

        // ⭐ COMMIT VOUCHER khi admin cập nhật payment status lên PAID
        // Chỉ commit nếu voucher đang ở trạng thái "pending" (chưa commit)
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
                // Không block việc cập nhật payment status
            }
        }
    }

    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');

    return res.json(createResponse(true, 200, 'Cập nhật booking thành công!', booking));
});

//* Admin sửa giờ sửa sân
export const updateBookingTime = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const admin = req.user;
    if (!admin || admin.role !== USER_ROLES.ADMIN) {
        return next(createError(403, 'Chỉ admin mới được chỉnh sửa đặt sân!'));
    }

    const { courtId, date, startTime, endTime } = req.body;

    if (!courtId || !date || !startTime || !endTime) {
        return next(createError(400, 'Thiếu sân, ngày hoặc giờ bắt đầu / kết thúc!'));
    }

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    const newDate = new Date(date);
    if (Number.isNaN(newDate.getTime())) {
        return next(createError(400, 'Ngày đặt không hợp lệ!'));
    }

    //*  Tính giờ  & Tiền theo ca
    const { slotCount, fieldAmount, totalHours } = calcFieldPriceBySlots(startTime, endTime, court);

    if (slotCount === 0) {
        return next(createError(400, 'Khung giờ không hợp lệ hoặc nằm ngoài giờ hoạt động!'));
    }

    //* check trùng giờ (không tính đơn hiện tại)
    const day = new Date(newDate);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const hasOverlap = await Booking.findOne({
        _id: { $ne: booking._id },
        courtId,
        date: { $gte: day, $lt: nextDay },
        status: { $ne: BOOKING_STATUS.CANCELLED },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
    });

    if (hasOverlap) {
        return next(createError(400, 'Khung giờ này đã có người đặt!'));
    }

    const oldCourtId = booking.courtId;
    const oldDate = booking.date;

    booking.courtId = courtId;
    booking.date = newDate;
    booking.startTime = startTime;
    booking.endTime = endTime;
    booking.hours = totalHours;
    booking.fieldAmount = fieldAmount;
    booking.equipmentTotal = booking.equipmentTotal || 0;
    booking.discountTotal = booking.discountTotal || 0;
    booking.total = fieldAmount + (booking.equipmentTotal || 0) - (booking.discountTotal || 0);
    booking.updatedAt = new Date();

    await booking.save();

    const io = req.app.get('io');
    //* cập nhật danh sách admin
    io?.emit('booking_global_updated');

    const newDateStr = newDate.toISOString().slice(0, 10);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    //* cập nhật sân + ngày mới cho client
    io?.to(String(courtId)).emit('booking_updated', {
        courtId: String(courtId),
        date: newDateStr,
    });

    //* nếu đổi sân hoặc đổi ngày thì bắn event cho sân hoặc ngày cũ để client reload lại
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

    // Phải đúng đơn của người đặt
    if (!user || String(booking.customerId) !== String(user._id)) {
        return next(createError(403, 'Bạn không có quyền yêu cầu hoàn tiền cho đơn này!'));
    }

    // Cho phép PENDING hoặc CANCELLED (user tự hủy)
    const allowStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CANCELLED];
    if (!allowStatuses.includes(booking.status)) {
        return next(
            createError(400, 'Chỉ được yêu cầu hoàn tiền cho đơn đang chờ xác nhận hoặc đã hủy!')
        );
    }

    // Nếu đã hủy nhưng do ADMIN hủy thì không cho user tự đòi hoàn
    if (booking.status === BOOKING_STATUS.CANCELLED && booking.cancelBy === USER_ROLES.ADMIN) {
        return next(
            createError(
                400,
                'Đơn này đã bị admin hủy, vui lòng liên hệ quản lý để được hỗ trợ hoàn tiền!'
            )
        );
    }

    //Chỉ hoàn tiền cho đơn đã thanh toán / đã cọc (PARTIAL hoặc PAID)
    if (![PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIAL].includes(booking.paymentStatus)) {
        return next(
            createError(400, 'Chỉ được yêu cầu hoàn tiền cho đơn đã thanh toán hoặc đã cọc!')
        );
    }

    // Không cho gửi lại nếu đang/đã xử lý
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

//* Admin cập nhật trạng thái hoàn tiền
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
    // cho user my-bookings
    io?.to(String(booking.courtId)).emit('booking_updated', {
        courtId: String(booking.courtId),
        date: booking.date.toISOString().slice(0, 10),
    });

    return res.json(createResponse(true, 200, 'Cập nhật hoàn tiền thành công!', booking));
});

//*  DASHBOARD ADMIN
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

//*  GET BY USER
export const getBookingsByUser = handleAsync(async (req, res, next) => {
    const userId = req.params.userId || req.user?._id;
    if (!userId) return next(createError(400, 'Thiếu userId!'));

    const bookings = await Booking.find({ customerId: userId })
        .populate('courtId', 'name type images image address')
        .populate('customerId', 'name username phone email') //
        .populate('voucherId', 'code discountType discountValue maxDiscountValue')
        .sort({ createdAt: -1 })
        .lean();

    return res.json(
        createResponse(true, 200, 'Lấy danh sách booking của người dùng thành công!', bookings)
    );
});
// * Lấy thông tin để thanh toán lại cho 1 booking
export const getRetryPaymentInfo = handleAsync(async (req, res, next) => {
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId)
        .populate('courtId', 'name type images image address')
        .populate('customerId', 'name username phone email')
        .lean();

    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;

    // chỉ cho phép CHÍNH CHỦ user xem lại
    if (user?.role === USER_ROLES.USER && String(booking.customerId?._id) !== String(user._id)) {
        return next(createError(403, 'Bạn không có quyền thanh toán lại đơn này!'));
    }

    // chỉ cho thanh toán lại khi đơn còn hiệu lực (PENDING)
    if (booking.status !== BOOKING_STATUS.PENDING) {
        return next(
            createError(400, 'Chỉ được thanh toán lại cho đơn đang chờ thanh toán/xác nhận!')
        );
    }

    // bắt buộc là VNPAY
    if (booking.paymentMethod !== PAYMENT_METHOD.VNPAY) {
        return next(
            createError(
                400,
                'Đơn này không thanh toán bằng VNPAY nên không thể thanh toán lại online!'
            )
        );
    }

    // nếu đã thanh toán đủ / đã hoàn tiền thì thôi
    if ([PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(booking.paymentStatus)) {
        return next(
            createError(
                400,
                'Đơn này đã thanh toán đủ hoặc đã hoàn tiền, không thể thanh toán lại!'
            )
        );
    }

    const total = Number(booking.total || booking.fieldAmount || 0);

    // tiền đã trả (đặt cọc)
    const depositPaid =
        booking.depositStatus === DEPOSIT_STATUS.PAID ? Number(booking.depositAmount || 0) : 0;

    const amountToPay = Math.max(0, total - depositPaid);

    if (amountToPay <= 0) {
        return next(createError(400, 'Đơn này đã thanh toán đủ tiền!'));
    }

    return res.json(
        createResponse(true, 200, 'Lấy thông tin thanh toán lại thành công!', {
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

    if (!['pending', 'processing'].includes(booking.refundStatus)) {
        return next(createError(400, 'Chỉ xử lý đơn đang yêu cầu hoàn tiền'));
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

export const completeRefundBooking = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const { billImage } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

    if (!['pending', 'processing'].includes(booking.refundStatus)) {
        return next(createError(400, 'Chỉ xử lý đơn đang yêu cầu hoàn tiền'));
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

    // chỉ cho thêm khi đang sử dụng
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

        // dùng chung field tồn kho giống checkin
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

        // trừ kho + tăng rentedQuantity nếu thuê
        eq[stockFieldName] = currentStock - realQty;
        if (mode === 'rent') {
            eq.rentedQuantity = (eq.rentedQuantity || 0) + realQty;
        }

        // LƯU booking_item mới
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

    // * Cộng dồn tiền thiết bị
    const addTotal =
        typeof equipmentTotal === 'number' ? Number(equipmentTotal) : Number(equipmentTotalCalc);
    booking.equipmentTotal = (booking.equipmentTotal || 0) + addTotal;
    //* Cập nhật lại tổng tiền đơn
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

    // Lấy danh sách thiết bị của đơn (đã lưu khi checkin / thêm thiết bị)
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

    const items = await BookingItem.find({ bookingId })
        .populate('equipmentId', 'name unit') // nếu muốn lấy tên, đơn vị
        .lean();

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
    // refundDeposit: boolean – admin tick "Đã hoàn lại cọc cho khách"
    // adminReason: ghi chú lý do

    const admin = req.user;
    if (!admin || admin.role !== USER_ROLES.ADMIN) {
        return next(createError(403, 'Chỉ admin mới được hủy đơn tiền mặt!'));
    }

    const booking = await Booking.findById(id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    // Không cho hủy đơn đang dùng / đã xong
    if ([BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
        return next(createError(400, 'Đơn đang sử dụng/đã hoàn tất, không thể hủy!'));
    }

    // Chỉ xử lý cho đơn thanh toán tiền mặt
    if (booking.paymentMethod !== PAYMENT_METHOD.CASH) {
        return next(
            createError(
                400,
                'API này chỉ dùng cho đơn thanh toán tiền mặt/COD. Đơn online dùng luồng hoàn tiền riêng!'
            )
        );
    }

    //  XỬ LÝ HOÀN / GIỮ CỌC
    //  Đơn chỉ mới đặt cọc 50% (PARTIAL)
    if (booking.depositAmount > 0 && booking.depositStatus === DEPOSIT_STATUS.PAID) {
        if (refundDeposit) {
            // admin đã TRẢ LẠI TIỀN CỌC cho khách (tiền mặt)
            booking.depositStatus = DEPOSIT_STATUS.REFUNDED;
            booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
            booking.refundStatus = 'refunded';
            booking.refundProcessedAt = new Date();
            booking.refundAdminReason =
                adminReason?.trim() ||
                'Admin hủy đơn thanh toán tiền mặt và đã trả lại tiền cọc cho khách';
        } else {
            // admin GIỮ CỌC (theo chính sách) – vẫn là PARTIAL
            // paymentStatus giữ nguyên (thường là PARTIAL)
            booking.refundStatus = booking.refundStatus || 'none';
            booking.refundAdminReason =
                adminReason?.trim() || 'Admin hủy đơn, admin giữ tiền cọc theo chính sách hủy sân';
        }
    } else if (booking.depositAmount === 0 && booking.paymentStatus === PAYMENT_STATUS.PAID) {
        //  Đơn đã thanh toán đủ 100% bằng tiền mặt
        if (refundDeposit) {
            // Ở đây refundDeposit = "ĐÃ HOÀN TIỀN CHO KHÁCH"
            booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
            booking.refundStatus = 'refunded';
            booking.refundProcessedAt = new Date();
            booking.refundAdminReason =
                adminReason?.trim() ||
                'Admin hủy đơn thanh toán tiền mặt và đã hoàn lại toàn bộ tiền cho khách';
        } else {
            // CLB không hoàn tiền (theo chính sách) – PAID giữ nguyên
            booking.refundStatus = booking.refundStatus || 'none';
            booking.refundAdminReason =
                adminReason?.trim() || 'Admin hủy đơn, CLB không hoàn tiền (theo chính sách)';
        }
    } else {
        // Đơn chưa thu đồng nào (UNPAID, deposit = 0)
        // => Không có gì để hoàn, chỉ cần hủy
        booking.refundStatus = booking.refundStatus || 'none';
        if (adminReason?.trim()) {
            booking.refundAdminReason = adminReason.trim();
        }
    }

    //  CẬP NHẬT TRẠNG THÁI HỦY
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelledAt = new Date();
    booking.updatedAt = new Date();
    booking.cancelBy = USER_ROLES.ADMIN;

    // Lý do hủy bên ngoài (cho cả user đọc)
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
