import { Router } from 'express';
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
} from './booking.controller.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { bookingSchema } from './booking.schema.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';

const routesBooking = Router();

routesBooking
    .route('/')
    .post(authenticate, validBodyRequest(bookingSchema), createBooking)
    .get(authenticate, getBookings);

routesBooking.get('/user/:userId', authenticate, getBookingsByUser);
routesBooking.get('/court/:courtId', getBookingsByCourt);
routesBooking.get('/calculate', calculateBookingPrice);

routesBooking.get('/admin/dashboard', authenticate, authorize('admin'), getAdminDashboardBookings);

routesBooking.patch('/:id', authenticate, authorize('admin'), updateBooking);

routesBooking.patch('/:id/cancel', authenticate, cancelBooking);
routesBooking.patch('/:id/confirm', authenticate, authorize('admin'), confirmBooking);
routesBooking.patch('/:id/checkin', authenticate, authorize('admin'), checkinBooking);
routesBooking.patch('/:id/checkout', authenticate, authorize('admin'), checkoutBooking);

export default routesBooking;
