import handleAsync from '../../utils/handleAsync.js';
import createError from '../../utils/error.js';
import createResponse from '../../utils/responses.js';
import { BOOKING_STATUS, USER_ROLES } from '../../common/constants/enums.js';
import Booking from '../bookings/booking.models.js';
import BookingItem from './bookingItem.models.js';
import Equipment from '../equipments/equipment.models.js';

//* Lấy thiết bị theo booking
export const getBookingItems = handleAsync(async (req, res, next) => {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    const user = req.user;

    if (user.role !== USER_ROLES.ADMIN && String(booking.customerId) !== String(user._id)) {
        return next(createError(403, 'Bạn không có quyền xem thiết bị của đơn này!'));
    }

    const items = await BookingItem.find({ bookingId })
        .populate('equipmentId', 'code name mode unit rentPrice salePrice')
        .lean();

    return res.json(createResponse(true, 200, 'Lấy danh sách thiết bị thành công!', items));
});

//* ADMIN CẬP NHẬT THIẾT BỊ CHO BOOKING
export const upsertBookingItems = handleAsync(async (req, res, next) => {
    const { bookingId } = req.params;
    const { items } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

    //  nên cho phép cả PENDING để kịp tính tiền trước khi thanh toán
    if (
        ![BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_USE].includes(
            booking.status
        )
    ) {
        return next(
            createError(400, 'Không thể cập nhật thiết bị cho trạng thái booking hiện tại!')
        );
    }

    const inputItems = Array.isArray(items) ? items : [];

    // Xóa hết items cũ
    await BookingItem.deleteMany({ bookingId });

    let createdItems = [];
    let equipmentTotal = 0;

    if (inputItems.length > 0) {
        //  lấy snapshot Equipment để fill name/unit + validate
        const equipIds = inputItems.map((i) => i.equipmentId);
        const equips = await Equipment.find({ _id: { $in: equipIds } }).lean();

        const equipMap = new Map(equips.map((e) => [String(e._id), e]));
        const missing = equipIds.find((id) => !equipMap.get(String(id)));
        if (missing) return next(createError(404, `Không tìm thấy thiết bị: ${missing}`));

        const docs = inputItems.map((i) => {
            const eq = equipMap.get(String(i.equipmentId));

            const qty = Number(i.qty || 0);
            if (!Number.isFinite(qty) || qty < 1) {
                throw createError(400, 'Số lượng thiết bị không hợp lệ');
            }

            let price = Number(i.price);
            if (!Number.isFinite(price) || price < 0) {
                // fallback theo mode
                price = i.mode === 'sell' ? Number(eq.salePrice || 0) : Number(eq.rentPrice || 0);
            }

            const subtotal = Math.max(0, qty * price);

            return {
                bookingId,
                equipmentId: i.equipmentId,
                name: eq.name, //   model required
                unit: eq.unit, //   model required
                mode: i.mode,
                qty,
                price,
                subtotal,
            };
        });

        createdItems = await BookingItem.insertMany(docs, { ordered: true });
        equipmentTotal = createdItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    }

    booking.equipmentTotal = equipmentTotal;
    booking.total = Math.max(
        0,
        Number(booking.fieldAmount || 0) + equipmentTotal - Number(booking.discountTotal || 0)
    );
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
