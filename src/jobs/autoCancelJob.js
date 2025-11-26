import { BOOKING_STATUS, PAYMENT_STATUS } from '../common/constants/enums.js';
import Booking from '../modules/bookings/booking.models.js';

function startAutoCancelJob(app) {
    const io = app.get('io');

    // chạy mỗi 60 giây
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
                booking.status = BOOKING_STATUS.CANCELLED;
                // booking.cancelBy = 'system';
                booking.cancelBy = null;
                booking.cancelReason = 'Hết thời gian thanh toán online (5 phút), đơn tự động hủy.';
                booking.cancelledAt = now;
                await booking.save();

                // bắn realtime cho FE
                io?.emit('booking_global_updated');
                io?.to(String(booking.courtId)).emit('booking_updated', {
                    courtId: String(booking.courtId),
                    date: booking.date.toISOString().slice(0, 10),
                });
            }
        } catch (err) {
            console.error('Auto-cancel booking job error:', err);
        }
    }, 60 * 1000);
}

export default startAutoCancelJob;
