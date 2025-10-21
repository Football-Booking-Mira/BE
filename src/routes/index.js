import { Router } from 'express';
import routesCourt from '../modules/courts/court.routes.js';
import routesBookings from '../modules/bookings/booking.routes.js';

const routes = Router();
routes.use('/courts', routesCourt);
routes.use('/bookings', routesBookings)
export default routes;
