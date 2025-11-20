// src/modules/bookingItems/bookingItem.controller.js
import handleAsync from '../../utils/handleAsync.js';
import createError from '../../utils/error.js';
import createResponse from '../../utils/responses.js';
import { BOOKING_STATUS, USER_ROLES } from '../../common/constants/enums.js';
import Booking from '../bookings/booking.models.js';
import BookingItem from './bookingItem.models.js';

//  LẤY THIẾT BỊ THEO BOOKING
export const getBookingItems = handleAsync(async (req, res, next) => {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId).lean();
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;
    // User thường chỉ xem được đơn của chính mình, admin xem được tất cả
    if (user.role !== USER_ROLES.ADMIN && String(booking.customerId) !== String(user._id)) {
        return next(createError(403, 'Bạn không có quyền xem thiết bị của đơn này!'));
    }

    const items = await BookingItem.find({ bookingId })
        .populate('equipmentId', 'code name mode')
        .lean();

    return res.json(createResponse(true, 200, 'Lấy danh sách thiết bị thành công!', items));
});

//  ADMIN CẬP NHẬT THIẾT BỊ CHO BOOKING
export const upsertBookingItems = handleAsync(async (req, res, next) => {
    const { bookingId } = req.params;
    const { items } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    // Chỉ cho sửa khi đơn đã xác nhận hoặc đang sử dụng
    if (![BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_USE].includes(booking.status)) {
        return next(
            createError(400, 'Chỉ được cập nhật thiết bị khi đơn đã xác nhận hoặc đang sử dụng!')
        );
    }

    if (!Array.isArray(items)) {
        return next(createError(400, 'Danh sách thiết bị không hợp lệ (cần là mảng)!'));
    }

    // Lọc và chuẩn hoá dữ liệu đầu vào
    const validItems = items
        .filter((i) => i && i.equipmentId && i.mode && i.qty && i.price >= 0)
        .map((i) => ({
            equipmentId: i.equipmentId,
            mode: i.mode, // 'rent' | 'sell'
            qty: Number(i.qty),
            price: Number(i.price),
        }))
        .filter((i) => ['rent', 'sell'].includes(i.mode) && i.qty > 0 && !Number.isNaN(i.price));

    // Xoá hết items cũ
    await BookingItem.deleteMany({ bookingId });

    let createdItems = [];
    let equipmentTotal = 0;

    if (validItems.length > 0) {
        const docs = validItems.map((i) => ({
            bookingId,
            equipmentId: i.equipmentId,
            mode: i.mode,
            qty: i.qty,
            price: i.price,
            subtotal: i.qty * i.price,
        }));

        createdItems = await BookingItem.insertMany(docs);
        equipmentTotal = createdItems.reduce((sum, it) => sum + it.subtotal, 0);
    }

    // Cập nhật tổng tiền thiết bị + tổng tiền booking
    booking.equipmentTotal = equipmentTotal;
    booking.total = (booking.fieldAmount || 0) + equipmentTotal - (booking.discountTotal || 0);
    booking.updatedAt = new Date();
    await booking.save();

    const io = req.app.get('io');
    io?.emit('booking_global_updated');

    return res.json(
        createResponse(true, 200, 'Cập nhật thiết bị cho booking thành công!', {
            booking,
            items: createdItems,
        })
    );
});
