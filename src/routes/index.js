import { Router } from "express";
import routesCourt from "../modules/courts/court.routes.js";
import routesBookings from "../modules/bookings/booking.routes.js";
import authRouter from "../modules/auth/auth.route.js";
import routesInvoices from "../modules/invoices/invoice.routes.js";

const routes = Router();
routes.use("/courts", routesCourt);
routes.use("/bookings", routesBookings);
routes.use("/auth", authRouter);
routes.use("/invoice", routesInvoices);
export default routes;
