import { Router } from 'express';
import routesCourt from '../modules/courts/court.routes.js';
import routesBookings from '../modules/bookings/booking.routes.js';
import authRouter from '../modules/auth/auth.route.js';
import routesInvoices from '../modules/invoices/invoice.routes.js';
import routerPayment from '../modules/payment/payment.routes.js';
import routesEquipment from '../modules/equipments/equipment.routes.js';
import routesBookingItem from '../modules/bookingItems/bookingItem.routes.js';
import userRouter from '../modules/users/user.routes.js';
import uploadRoutes from '../common/routes/upload.routes.js';

const routes = Router();

routes.use('/courts', routesCourt);
routes.use('/bookings', routesBookings);
routes.use('/auth', authRouter);
routes.use('/invoices', routesInvoices);
routes.use('/payment', routerPayment);
routes.use('/equipments', routesEquipment);
routes.use('/booking-items', routesBookingItem);
routes.use('/users', userRouter);
// upload ảnh đăng ký user,bill chuyển tiền
routes.use('/upload', uploadRoutes);

export default routes;
