import { Router } from 'express';
import {
    adminAddNote,
    adminCancelBooking,
    adminCheckinBooking,
    adminCompleteBooking,
    adminConfirmBooking,
    adminRefundBooking,
    cancelBooking,
    checkinBooking,
    checkoutBooking,
    createBooking,
    deleteBooking,
    getAdminBookingDetail,
    getAllBookings,
    getBookingById,
    getMyBookings,
    updateBooking,
    updatePaymentStatus,
} from './booking.controller.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import { USER_ROLES } from '../../common/constants/enums.js';

const routesBookings = Router();

routesBookings.use(authenticate);

routesBookings.post('/', createBooking);
routesBookings.get('/my-bookings', getMyBookings);
routesBookings.get('/', authorize(USER_ROLES.ADMIN), getAllBookings);
routesBookings.get('/:id/admin', authorize(USER_ROLES.ADMIN), getAdminBookingDetail);
routesBookings.post('/:id/admin/confirm', authorize(USER_ROLES.ADMIN), adminConfirmBooking);
routesBookings.post('/:id/admin/cancel', authorize(USER_ROLES.ADMIN), adminCancelBooking);
routesBookings.post('/:id/admin/checkin', authorize(USER_ROLES.ADMIN), adminCheckinBooking);
routesBookings.post('/:id/admin/complete', authorize(USER_ROLES.ADMIN), adminCompleteBooking);
routesBookings.post('/:id/admin/refund', authorize(USER_ROLES.ADMIN), adminRefundBooking);
routesBookings.post('/:id/admin/notes', authorize(USER_ROLES.ADMIN), adminAddNote);
routesBookings.get('/:id', getBookingById);
routesBookings.put('/:id', authorize(USER_ROLES.ADMIN), updateBooking);
routesBookings.delete('/:id', authorize(USER_ROLES.ADMIN), deleteBooking);

routesBookings.post('/checkin', authorize(USER_ROLES.ADMIN), checkinBooking);
routesBookings.post('/checkout', authorize(USER_ROLES.ADMIN), checkoutBooking);
routesBookings.put('/:id/cancel', cancelBooking);
routesBookings.put('/:id/payment-status', authorize(USER_ROLES.ADMIN), updatePaymentStatus);

export default routesBookings;
