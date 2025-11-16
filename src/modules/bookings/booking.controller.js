import { BOOKING_STATUS, PAYMENT_STATUS, USER_ROLES } from '../../common/constants/enums.js';
import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import { Court } from '../courts/court.models.js';
import Booking from './booking.models.js';

//TÍNH TIỀN

export const calculateBookingPrice = handleAsync(async (req, res, next) => {
    const { courtId, startTime, endTime } = req.query;
    if (!courtId || !startTime || !endTime)
        return next(createError(400, 'Thiếu dữ liệu để tính tiền!'));

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    const toMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (end <= start) return next(createError(400, 'Giờ kết thúc phải sau giờ bắt đầu!'));

    const OPEN_START = 6 * 60,
        OPEN_END = 22 * 60,
        PEAK_START = 16 * 60,
        PEAK_END = 22 * 60;
    const realStart = Math.max(start, OPEN_START);
    const realEnd = Math.min(end, OPEN_END);
    if (realEnd <= realStart)
        return next(createError(400, 'Khung giờ nằm ngoài giờ hoạt động (06:00–22:00)!'));

    const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
    const peakMinutes = overlap(realStart, realEnd, PEAK_START, PEAK_END);
    const normalMinutes = realEnd - realStart - peakMinutes;
    const total = (normalMinutes / 60) * court.basePrice + (peakMinutes / 60) * court.peakPrice;

    return res.status(200).json(
        createResponse(true, 200, 'Tính tiền thành công!', {
            total,
            normalHours: normalMinutes / 60,
            peakHours: peakMinutes / 60,
            totalHours: (realEnd - realStart) / 60,
        })
    );
});

// TẠO BOOKING

export const createBooking = handleAsync(async (req, res, next) => {
    const { courtId, customerId, date, startTime, endTime, paymentMethod, note } = req.body;
    if (!courtId || !date || !startTime || !endTime)
        return next(createError(400, 'Thiếu dữ liệu bắt buộc!'));

    const court = await Court.findById(courtId);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));

    const role = req.user?.role || USER_ROLES.USER;
    const finalCustomerId = customerId || req.user?._id || null;
    const isAdmin = role === USER_ROLES.ADMIN;

    const toMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const start = toMinutes(startTime),
        end = toMinutes(endTime);
    const OPEN_START = 6 * 60,
        OPEN_END = 22 * 60,
        PEAK_START = 16 * 60,
        PEAK_END = 22 * 60;
    const realStart = Math.max(start, OPEN_START),
        realEnd = Math.min(end, OPEN_END);
    if (end <= start || realEnd <= realStart)
        return next(createError(400, 'Khung giờ không hợp lệ!'));

    const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
    const peakMinutes = overlap(realStart, realEnd, PEAK_START, PEAK_END);
    const normalMinutes = realEnd - realStart - peakMinutes;
    const total = (normalMinutes / 60) * court.basePrice + (peakMinutes / 60) * court.peakPrice;

    // kiểm tra trùng giờ
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const hasOverlap = await Booking.findOne({
        courtId,
        date: { $gte: day, $lt: nextDay },
        status: { $nin: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED] },
        $and: [{ startTime: { $lt: endTime } }, { endTime: { $gt: startTime } }],
    });
    if (hasOverlap) return next(createError(400, 'Khung giờ này đã có người đặt!'));

    const booking = await Booking.create({
        code: `BK${Date.now().toString().slice(-6)}`,
        courtId,
        customerId: finalCustomerId,
        date,
        startTime,
        endTime,
        hours: (realEnd - realStart) / 60,
        total,
        paymentMethod,
        note,
        status: isAdmin ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING,
        // paymentStatus: paymentMethod === 'vnpay' ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.UNPAID,
        paymentStatus: PAYMENT_STATUS.UNPAID,
        createdBy: role,
    });

    const io = req.app.get('io');
    io?.to(String(courtId)).emit('booking_updated', {
        courtId: String(courtId),
        date: new Date(date).toISOString().slice(0, 10),
    });

    return res.status(201).json(createResponse(true, 201, 'Đặt sân thành công!', booking));
});

// LẤY BOOKING THEO SÂN

export const getBookingsByCourt = handleAsync(async (req, res, next) => {
    const { courtId } = req.params;
    const { startDate, endDate } = req.query;

    if (!courtId) return next(createError(400, 'Thiếu courtId!'));
    const query = {
        courtId,
        status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_USE] },
    };
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };

    const bookings = await Booking.find(query)
        .select('date startTime endTime status')
        .sort({ date: 1, startTime: 1 })
        .lean();

    return res.json(createResponse(true, 200, 'Danh sách giờ đã được đặt', bookings));
});

// HỦY / XÁC NHẬN / CHECKIN / CHECKOUT

export const cancelBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.updatedAt = new Date();
    await booking.save();
    req.app
        .get('io')
        ?.to(String(booking.courtId))
        .emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });
    return res.json(createResponse(true, 200, '❌ Hủy booking thành công!', booking));
});

export const confirmBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));
    booking.status = BOOKING_STATUS.CONFIRMED;
    booking.updatedAt = new Date();
    await booking.save();
    req.app
        .get('io')
        ?.to(String(booking.courtId))
        .emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });
    return res.json(createResponse(true, 200, 'Xác nhận booking thành công!', booking));
});

export const checkinBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));
    if (![BOOKING_STATUS.CONFIRMED].includes(booking.status))
        return next(createError(400, 'Chỉ được check-in khi đã xác nhận!'));
    booking.status = BOOKING_STATUS.IN_USE;
    booking.checkinAt = new Date();
    await booking.save();
    req.app
        .get('io')
        ?.to(String(booking.courtId))
        .emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });
    return res.json(createResponse(true, 200, ' Check-in thành công!', booking));
});

export const checkoutBooking = handleAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));
    if (booking.status !== BOOKING_STATUS.IN_USE)
        return next(createError(400, 'Chỉ được check-out khi đang sử dụng!'));
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.paymentStatus = PAYMENT_STATUS.PAID;
    booking.checkoutAt = new Date();
    await booking.save();
    req.app
        .get('io')
        ?.to(String(booking.courtId))
        .emit('booking_updated', {
            courtId: String(booking.courtId),
            date: booking.date.toISOString().slice(0, 10),
        });
    return res.json(createResponse(true, 200, ' Check-out thành công!', booking));
});

// DASHBOARD ADMIN

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

// LẤY DANH SÁCH BOOKING (ADMIN & USER)

export const getBookings = handleAsync(async (req, res, next) => {
    const role = req.user?.role;
    const filter = role === USER_ROLES.ADMIN ? {} : { customerId: req.user._id };

    const bookings = await Booking.find(filter)
        .populate('courtId', 'name type')
        .populate('customerId', 'name phone')
        .sort({ createdAt: -1 })
        .lean();

    return res.json(createResponse(true, 200, 'Lấy danh sách booking thành công!', bookings));
});

// LẤY BOOKING THEO USER ID

export const getBookingsByUser = handleAsync(async (req, res, next) => {
    const { userId } = req.params;
    if (!userId) return next(createError(400, 'Thiếu userId!'));

    const bookings = await Booking.find({ customerId: userId })
        .populate('courtId', 'name type')
        .populate('customerId', 'name phone')
        .sort({ createdAt: -1 })
        .lean();

    return res.json(
        createResponse(true, 200, 'Lấy danh sách booking của người dùng thành công!', bookings)
    );
});
