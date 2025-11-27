import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { bookingSchema } from './booking.schema.js';

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
} from './booking.controller.js';

const routesBooking = Router();

routesBooking
    .route('/')
    .post(authenticate, validBodyRequest(bookingSchema), createBooking)
    .get(authenticate, getBookings);

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

export default routesBooking;
