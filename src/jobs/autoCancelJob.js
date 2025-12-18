import mongoose from 'mongoose';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../common/constants/enums.js';
import Booking from '../modules/bookings/booking.models.js';
import BookingItem from '../modules/bookingItems/bookingItem.models.js';
import Equipment from '../modules/equipments/equipment.models.js';

const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const getStockFieldName = (eq) =>
    typeof eq.availableQuantity === 'number'
        ? 'availableQuantity'
        : typeof eq.stockLeft === 'number'
          ? 'stockLeft'
          : typeof eq.stock === 'number'
            ? 'stock'
            : 'totalQuantity';

// trả kho + xóa bookingItems (support bookingId string/ObjectId)
const restoreEquipAndDeleteItems = async (bookingId) => {
    const oid = mongoose.Types.ObjectId.isValid(String(bookingId))
        ? new mongoose.Types.ObjectId(String(bookingId))
        : null;

    const items = await BookingItem.find({
        $or: [{ bookingId: String(bookingId) }, ...(oid ? [{ bookingId: oid }] : [])],
    })
        .lean()
        .catch(() => []);

    for (const it of items) {
        const eq = await Equipment.findById(it.equipmentId).catch(() => null);
        if (!eq) continue;

        const f = getStockFieldName(eq);
        eq[f] = safeNum(eq[f]) + safeNum(it.qty);
        await eq.save().catch(() => {});
    }

    await BookingItem.deleteMany({
        $or: [{ bookingId: String(bookingId) }, ...(oid ? [{ bookingId: oid }] : [])],
    }).catch(() => {});
};

function startAutoCancelJob(app) {
    const io = app.get('io');

    // chạy mỗi 10s cho “release slot”
    setInterval(async () => {
        try {
            const now = new Date();

            const expiredBookings = await Booking.find({
                status: BOOKING_STATUS.PENDING,
                paymentStatus: PAYMENT_STATUS.UNPAID,
                autoCancelAt: { $lte: now },
            });

            if (!expiredBookings.length) return;

            for (const booking of expiredBookings) {
                // trả kho + xóa item trước
                await restoreEquipAndDeleteItems(booking._id);

                booking.status = BOOKING_STATUS.CANCELLED;
                booking.cancelBy = 'system';
                booking.cancelReason = 'Hết thời gian thanh toán online (5 phút), đơn tự động hủy.';
                booking.cancelledAt = now;

                // clear autoCancelAt để khỏi treo
                booking.autoCancelAt = null;

                // voucher: chỉ restore nếu đã commit (applied)
                if (booking.voucherUsageId && booking.voucherUsageStatus === 'applied') {
                    const { restoreVoucherUsage } =
                        await import('../modules/vouchers/voucher.service.js');
                    try {
                        await restoreVoucherUsage(booking);
                        booking.voucherUsageStatus = 'restored';
                        booking.voucherRestoredAt = now;
                    } catch (error) {
                        console.error('❌ restore voucher autoCancelJob:', error.message);
                    }
                } else if (booking.voucherUsageStatus === 'pending') {
                    booking.voucherUsageStatus = 'none';
                    booking.voucherUsageId = undefined;
                }

                await booking.save();

                io?.emit('booking_global_updated');
                io?.to(String(booking.courtId)).emit('booking_updated', {
                    courtId: String(booking.courtId),
                    date: booking.date.toISOString().slice(0, 10),
                });
            }
        } catch (err) {
            console.error('Auto-cancel booking job error:', err);
        }
    }, 10 * 1000);
}

export default startAutoCancelJob;
