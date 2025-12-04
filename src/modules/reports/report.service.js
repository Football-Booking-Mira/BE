// src/modules/reports/report.service.js
import Booking from "../../modules/bookings/booking.models.js";
import { Court } from "../../modules/courts/court.models.js";

// ⚠️ Named export
export const getBookingStatsService = async() => {
    // 1️⃣ Khung giờ hot nhất
    const hotHourAgg = await Booking.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$startTime", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
    ]);
    const hotHour = hotHourAgg[0] ? { hour: hotHourAgg[0]._id, count: hotHourAgg[0].count } :
        null;

    // 2️⃣ Khách đặt nhiều nhất
    const topCustomerAgg = await Booking.aggregate([
        { $match: { isDeleted: false, customerInfo: { $ne: null } } },
        {
            $group: {
                _id: "$customerInfo.phone",
                count: { $sum: 1 },
                user: { $first: "$customerInfo" },
            },
        },
        { $sort: { count: -1 } },
        { $limit: 1 },
    ]);
    const topCustomer = topCustomerAgg[0] ? { user: topCustomerAgg[0].user, count: topCustomerAgg[0].count } :
        null;

    // 3️⃣ Sân đặt nhiều nhất
    const topCourtAgg = await Booking.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$courtId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
    ]);

    let topCourt = null;
    if (topCourtAgg[0]) {
        const court = await Court.findById(topCourtAgg[0]._id).lean();
        topCourt = { court, count: topCourtAgg[0].count };
    }

    return { hotHour, topCustomer, topCourt };
};