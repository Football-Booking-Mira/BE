import { Router } from "express";
import routesCourt from "../modules/courts/court.routes.js";
import routesBookings from "../modules/bookings/booking.routes.js";
import authRouter from "../modules/auth/auth.route.js";
import paymentRoutes from "../modules/payments/payment.routes.js";

const routes = Router();
routes.use("/courts", routesCourt);
routes.use("/bookings", routesBookings);
routes.use("/auth", authRouter);
routes.use("/payments", paymentRoutes);
export default routes;
