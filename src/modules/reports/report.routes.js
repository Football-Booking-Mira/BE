// src/modules/reports/report.routes.js
import { Router } from "express";
import { bookingStats } from "./report.controller.js";
import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";

const routesReport = Router();
routesReport.get("/public/booking-stats",
    // #swagger.tags = ['Reports']
    // #swagger.summary = 'Lấy thống kê đặt sân công khai'
    bookingStats
);
routesReport.use(authenticate, authorize("admin"));
routesReport.get("/booking-stats",
    // #swagger.tags = ['Reports']
    // #swagger.summary = 'Lấy thống kê đặt sân (admin)'
    bookingStats
);

export default routesReport;