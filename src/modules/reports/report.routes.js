// src/modules/reports/report.routes.js
import { Router } from "express";
import { bookingStats } from "./report.controller.js";
import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";

const routesReport = Router();

/* Public route - ai cũng xem được */
routesReport.get("/public/booking-stats", bookingStats);

/* Admin route - chỉ admin xem được */
routesReport.use(authenticate, authorize("admin"));
routesReport.get("/booking-stats", bookingStats);

export default routesReport;