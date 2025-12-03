import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { bookingSchema } from './booking.schema.js';
import { multiBookingSchema } from './booking.schema.js';

import {
    createBooking,
    checkinBooking,
    checkoutBooking,
    confirmBooking,
    cancelBooking,
    getAdminDashboardBookings,
    getBookings,
    getBookingsByCourt,
    calculateBookingPrice,
    getBookingsByUser,
    updateBooking,
    requestRefund,
    updateRefundStatus,
    updateBookingTime,
    getRetryPaymentInfo,
    completeRefundBooking,
    rejectRefundBooking,
    addEquipmentsBooking,
    getBookingDetailAdmin,
    getBookingEquipmentsDetail,
    adminCancelCashBooking,
    createMultiBooking
} from './booking.controller.js';

const routesBooking = Router();

routesBooking
    .route('/')
    .post(authenticate, validBodyRequest(bookingSchema), createBooking)
    .get(authenticate, getBookings);

routesBooking.post(
    '/multi',
    authenticate,
    validBodyRequest(multiBookingSchema),
    createMultiBooking
);

routesBooking.get('/user/:userId', authenticate, getBookingsByUser);
routesBooking.get('/court/:courtId', getBookingsByCourt);
routesBooking.get('/calculate', calculateBookingPrice);

routesBooking.get(
    '/admin/dashboard',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getAdminDashboardBookings
);
// ĐANG DÙNG
routesBooking.get('/:id/retry-payment-info', authenticate, getRetryPaymentInfo);

//* ADMIN cập nhật thanh toán
routesBooking.patch('/:id', authenticate, authorize(USER_ROLES.ADMIN), updateBooking);

//* ADMIN chỉnh giờ / sân
routesBooking.patch('/:id/time', authenticate, authorize(USER_ROLES.ADMIN), updateBookingTime);

routesBooking.patch(
    '/:id/refund-status',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    updateRefundStatus
);
// Admin xử lý hoàn tiền
routesBooking.post(
    '/:id/refund/reject',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    rejectRefundBooking
);

routesBooking.post(
    '/:id/refund/complete',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    completeRefundBooking
);

//* USER gửi yêu cầu hoàn tiền
routesBooking.post('/:id/refund-request', authenticate, authorize(USER_ROLES.USER), requestRefund);
//* hủy , xác nhận ,checkin ,checkout
routesBooking.patch('/:id/cancel', authenticate, cancelBooking);
routesBooking.patch('/:id/confirm', authenticate, authorize(USER_ROLES.ADMIN), confirmBooking);
routesBooking.patch('/:id/checkin', authenticate, authorize(USER_ROLES.ADMIN), checkinBooking);
routesBooking.patch(
    '/:id/equipments',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    addEquipmentsBooking
);
// Admin xem chi tiết đơn + thiết bị
routesBooking.get(
    '/:id/admin-detail',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getBookingDetailAdmin
);
// LẤY THIẾT BỊ CỦA ĐƠN (cho admin xem / prefill)
routesBooking.get(
    '/:id/equipments-detail',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getBookingEquipmentsDetail
);
routesBooking.patch('/:id/checkout', authenticate, authorize(USER_ROLES.ADMIN), checkoutBooking);
routesBooking.post('/payment/vietqr', async (req, res) => {
    try {
        const { bookingId, amount, customer } = req.body;

        const response = await fetch("https://api.vietqr.io/v2/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                accountNo: "0302733686666",
                accountName: "Nguyen Tien Manh",
                acqId: 970422,
                amount,
                addInfo: `Thanh toan booking ${bookingId}`,
                template: "compact"
            })
        });

        const data = await response.json();

        console.log("VietQR API trả về:", data);

        // ❗ Nếu API lỗi hoặc không có data
        if (!data?.data?.qrDataURL) {
            return res.json({
                success: false,
                message: "Không nhận được mã QR từ VietQR!"
            });
        }

        return res.json({
            success: true,
            data: {
                qrImageBase64: data.data.qrDataURL,  // ảnh QR base64
                qrString: data.data.qrString,        // raw string nếu cần
                amount
            }
        });

    } catch (e) {
        console.log(e);
        return res.json({ success: false, message: "Lỗi tạo VietQR" });
    }
});


//admin hủy tiền cọc tại quầy
routesBooking.post(
    '/:id/admin-cancel-cash',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    adminCancelCashBooking
);

export default routesBooking;
