import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { bookingSchema, multiBookingSchema } from './booking.schema.js';

import {
    createBooking, checkinBooking, checkoutBooking, confirmBooking,
    cancelBooking, getAdminDashboardBookings, getBookings,
    getBookingsByCourt, calculateBookingPrice, getBookingsByUser,
    updateBooking, requestRefund, updateRefundStatus, updateBookingTime,
    getRetryPaymentInfo, completeRefundBooking, rejectRefundBooking,
    addEquipmentsBooking, getBookingDetailAdmin, getBookingEquipmentsDetail,
    adminCancelCashBooking, createMultiBooking,
} from './booking.controller.js';

const routesBooking = Router();

routesBooking.post('/',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Tạo đơn đặt sân mới'
    authenticate, validBodyRequest(bookingSchema), createBooking
);
routesBooking.get('/',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy danh sách đơn đặt sân'
    authenticate, getBookings
);
routesBooking.post('/multi',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Tạo nhiều đơn đặt sân cùng lúc'
    authenticate, validBodyRequest(multiBookingSchema), createMultiBooking
);
routesBooking.get('/user/:userId',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy danh sách đơn đặt sân theo người dùng'
    authenticate, getBookingsByUser
);
routesBooking.get('/court/:courtId',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy danh sách đơn đặt sân theo sân'
    getBookingsByCourt
);
routesBooking.get('/calculate',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Tính giá đặt sân (GET)'
    calculateBookingPrice
);
routesBooking.post('/calculate',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Tính giá đặt sân (POST)'
    calculateBookingPrice
);
routesBooking.get('/admin/dashboard',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy dữ liệu dashboard quản trị đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), getAdminDashboardBookings
);
routesBooking.get('/:id/retry-payment-info',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy thông tin thanh toán lại'
    authenticate, getRetryPaymentInfo
);
routesBooking.patch('/:id',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Cập nhật đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), updateBooking
);
routesBooking.patch('/:id/time',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Cập nhật thời gian đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), updateBookingTime
);
routesBooking.patch('/:id/refund-status',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Cập nhật trạng thái hoàn tiền'
    authenticate, authorize(USER_ROLES.ADMIN), updateRefundStatus
);
routesBooking.post('/:id/refund/reject',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Từ chối yêu cầu hoàn tiền'
    authenticate, authorize(USER_ROLES.ADMIN), rejectRefundBooking
);
routesBooking.post('/:id/refund/complete',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Hoàn tất hoàn tiền'
    authenticate, authorize(USER_ROLES.ADMIN), completeRefundBooking
);
routesBooking.post('/:id/refund-request',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Gửi yêu cầu hoàn tiền'
    authenticate, authorize(USER_ROLES.USER), requestRefund
);
routesBooking.patch('/:id/cancel',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Hủy đơn đặt sân'
    authenticate, cancelBooking
);
routesBooking.patch('/:id/confirm',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Xác nhận đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), confirmBooking
);
routesBooking.patch('/:id/checkin',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Check-in đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), checkinBooking
);
routesBooking.patch('/:id/equipments',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Thêm thiết bị vào đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), addEquipmentsBooking
);
routesBooking.get('/:id/admin-detail',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy chi tiết đơn đặt sân (admin)'
    authenticate, authorize(USER_ROLES.ADMIN), getBookingDetailAdmin
);
routesBooking.get('/:id/equipments-detail',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Lấy chi tiết thiết bị của đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), getBookingEquipmentsDetail
);
routesBooking.patch('/:id/checkout',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Check-out đơn đặt sân'
    authenticate, authorize(USER_ROLES.ADMIN), checkoutBooking
);
routesBooking.post('/payment/vietqr', authenticate, async (req, res) => {
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Thanh toán qua VietQR'
    res.json({ success: true });
});
routesBooking.post('/:id/admin-cancel-cash',
    // #swagger.tags = ['Bookings']
    // #swagger.summary = 'Admin hủy đơn thanh toán tiền mặt'
    authenticate, authorize(USER_ROLES.ADMIN), adminCancelCashBooking
);

export default routesBooking;
