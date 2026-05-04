import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { bookingSchema, multiBookingSchema } from './booking.schema.js';

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
    createMultiBooking,
} from './booking.controller.js';

const routesBooking = Router();

// Tạo / lấy danh sách booking
routesBooking
    .route('/')
    .post(authenticate, validBodyRequest(bookingSchema), createBooking)
    .get(authenticate, getBookings);

// Tạo booking nhiều ca (multi)
routesBooking.post(
    '/multi',
    authenticate,
    validBodyRequest(multiBookingSchema),
    createMultiBooking
);

// Booking theo user / theo sân
routesBooking.get('/user/:userId', authenticate, getBookingsByUser);
routesBooking.get('/court/:courtId', getBookingsByCourt);

// Tính tiền
routesBooking.get('/calculate', calculateBookingPrice);
routesBooking.post('/calculate', calculateBookingPrice);

// Dashboard admin
routesBooking.get(
    '/admin/dashboard',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getAdminDashboardBookings
);

// LẤY THÔNG TIN THANH TOÁN LẠI (VNPay)
routesBooking.get('/:id/retry-payment-info', authenticate, getRetryPaymentInfo);

// ADMIN cập nhật thanh toán
routesBooking.patch('/:id', authenticate, authorize(USER_ROLES.ADMIN), updateBooking);

// ADMIN chỉnh giờ / sân
routesBooking.patch('/:id/time', authenticate, authorize(USER_ROLES.ADMIN), updateBookingTime);

//  ROUTE CẬP NHẬT TRẠNG THÁI HOÀN TIỀN (pending <-> processing)
routesBooking.patch(
    '/:id/refund-status',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    updateRefundStatus
);

// Admin xử lý hoàn tiền: từ chối
routesBooking.post(
    '/:id/refund/reject',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    rejectRefundBooking
);

// Admin xử lý hoàn tiền: hoàn tiền xong + upload bill
routesBooking.post(
    '/:id/refund/complete',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    completeRefundBooking
);

// USER gửi yêu cầu hoàn tiền
routesBooking.post('/:id/refund-request', authenticate, authorize(USER_ROLES.USER), requestRefund);

// Hủy / xác nhận / checkin / checkout
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

// Lấy thiết bị của đơn (cho modal xem chi tiết / prefill thêm thiết bị)
routesBooking.get(
    '/:id/equipments-detail',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getBookingEquipmentsDetail
);

// Checkout
routesBooking.patch('/:id/checkout', authenticate, authorize(USER_ROLES.ADMIN), checkoutBooking);

// Tạo mã VietQR để thanh toán
routesBooking.post('/payment/vietqr', authenticate, async (req, res) => {
    try {
        const { bookingId, amount } = req.body;

        const response = await fetch('https://api.vietqr.io/v2/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountNo: '0302733686666',
                accountName: 'Nguyen Tien Manh',
                acqId: 970422,
                amount,
                addInfo: `Thanh toan booking ${bookingId}`,
                template: 'compact',
            }),
        });

        const data = await response.json();

        console.log('VietQR API trả về:', data);

        if (!data?.data?.qrDataURL) {
            return res.status(500).json({
                success: false,
                message: 'Không nhận được mã QR từ VietQR!',
            });
        }

        return res.json({
            success: true,
            data: {
                qrImageBase64: data.data.qrDataURL,
                qrString: data.data.qrString,
                amount,
                accountNo: '0302733686666',
                accountName: 'Nguyen Tien Manh',
                bankName: 'MB Bank',
                addInfo: `Thanh toan booking ${bookingId}`,
            },
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: 'Lỗi tạo VietQR' });
    }
});

// Admin hủy đơn thanh toán tiền mặt / COD
routesBooking.post(
    '/:id/admin-cancel-cash',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    adminCancelCashBooking
);

export default routesBooking;
