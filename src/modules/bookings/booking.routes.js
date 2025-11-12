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
} from './booking.controller.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { bookingSchema } from './booking.schema.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';

const routesBooking = Router();

//  CRUD
routesBooking
    .route('/')
    .post(authenticate, validBodyRequest(bookingSchema), createBooking)
    .get(authenticate, getBookings);

//  LẤY BOOKING THEO USER
routesBooking.get('/user/:userId', authenticate, getBookingsByUser);

//  LẤY BOOKING THEO SÂN
routesBooking.get('/court/:courtId', getBookingsByCourt); // để FE không cần auth

//  TÍNH TIỀN SÂN
routesBooking.get('/calculate', calculateBookingPrice);

//  ADMIN DASHBOARD
routesBooking.get('/admin/dashboard', authenticate, authorize('admin'), getAdminDashboardBookings);

//  CHECKIN / CHECKOUT / CONFIRM / CANCEL
routesBooking.patch('/:id/cancel', authenticate, cancelBooking);
routesBooking.patch('/:id/confirm', authenticate, authorize('admin'), confirmBooking);
routesBooking.patch('/:id/checkin', authenticate, authorize('admin'), checkinBooking);
routesBooking.patch('/:id/checkout', authenticate, authorize('admin'), checkoutBooking);

export default routesBooking;
