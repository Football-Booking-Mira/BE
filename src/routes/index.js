import { Router } from 'express';
import routesCourt from '../modules/courts/court.routes.js';
import authRouter from '../modules/auth/auth.route.js';
import routesBooking from '../modules/bookings/booking.routes.js';

const routes = Router();

routes.use('/courts', routesCourt);
routes.use('/bookings', routesBooking);
routes.use('/auth', authRouter);

export default routes;
