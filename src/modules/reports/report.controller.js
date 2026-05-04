// src/modules/reports/report.controller.js
import handleAsync from "../../utils/handleAsync.js";
import createResponse from "../../utils/responses.js";
import { getBookingStatsService } from "./report.service.js";

/**
 * 📊 Controller trả về thống kê booking
 */
export const bookingStats = handleAsync(async(req, res) => {
    const { period, offset } = req.query;
    const result = await getBookingStatsService({ period, offset });
    return res.json(
        createResponse(true, 200, "Lấy thống kê booking thành công!", result)
    );
});