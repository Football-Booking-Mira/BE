// // src/modules/reports/report.service.js
// import Booking from "../../modules/bookings/booking.models.js";
// import { Court } from "../../modules/courts/court.models.js";

// // ⚠️ Named export
// export const getBookingStatsService = async() => {
//     // 1️⃣ Khung giờ hot nhất
//     const hotHourAgg = await Booking.aggregate([
//         { $match: { isDeleted: false } },
//         { $group: { _id: "$startTime", count: { $sum: 1 } } },
//         { $sort: { count: -1 } },
//         { $limit: 1 },
//     ]);
//     const hotHour = hotHourAgg[0] ? { hour: hotHourAgg[0]._id, count: hotHourAgg[0].count } :
//         null;

//     // 2️⃣ Khách đặt nhiều nhất
//     const topCustomerAgg = await Booking.aggregate([
//         { $match: { isDeleted: false, customerInfo: { $ne: null } } },
//         {
//             $group: {
//                 _id: "$customerInfo.phone",
//                 count: { $sum: 1 },
//                 user: { $first: "$customerInfo" },
//             },
//         },
//         { $sort: { count: -1 } },
//         { $limit: 1 },
//     ]);
//     const topCustomer = topCustomerAgg[0] ? { user: topCustomerAgg[0].user, count: topCustomerAgg[0].count } :
//         null;

//     // 3️⃣ Sân đặt nhiều nhất
//     const topCourtAgg = await Booking.aggregate([
//         { $match: { isDeleted: false } },
//         { $group: { _id: "$courtId", count: { $sum: 1 } } },
//         { $sort: { count: -1 } },
//         { $limit: 1 },
//     ]);

//     let topCourt = null;
//     if (topCourtAgg[0]) {
//         const court = await Court.findById(topCourtAgg[0]._id).lean();
//         topCourt = { court, count: topCourtAgg[0].count };
//     }

//     return { hotHour, topCustomer, topCourt };
// };

// src/modules/reports/report.service.js


import Booking from "../../modules/bookings/booking.models.js";
import { Court } from "../../modules/courts/court.models.js";

// ✅ Named export đúng theo style của bạn
export const getBookingStatsService = async() => {

    // 1️⃣ Khung giờ hot nhất theo range (from–to)
    const hotHourAgg = await Booking.aggregate([
        { $match: { isDeleted: false } },
        {
            $group: {
                _id: { from: "$startTime", to: "$endTime" }, // gom nhóm theo khoảng giờ
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 1 }
    ]);

    const hotHour = hotHourAgg[0] ? {
        fromHour: hotHourAgg[0]._id.from,
        toHour: hotHourAgg[0]._id.to,
        count: hotHourAgg[0].count
    } : null;

    // 2️⃣ Khách đặt nhiều nhất (Top 1)
    const topCustomerAgg = await Booking.aggregate([
        { $match: { isDeleted: false, customerInfo: { $ne: null } } },
        {
            $group: {
                _id: "$customerInfo.phone",
                count: { $sum: 1 },
                user: { $first: "$customerInfo" }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 1 }
    ]);

    const topCustomer = topCustomerAgg[0] ? {
        user: topCustomerAgg[0].user,
        count: topCustomerAgg[0].count
    } : null;

    // 3️⃣ Top 4 khách đặt nhiều nhất
    const top4CustomersAgg = await Booking.aggregate([
        { $match: { isDeleted: false, customerInfo: { $ne: null } } },
        {
            $group: {
                _id: "$customerInfo.phone",
                count: { $sum: 1 },
                user: { $first: "$customerInfo" }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 4 }
    ]);

    const topCustomersList = top4CustomersAgg.map(i => ({
        user: i.user,
        count: i.count
    }));

    // 4️⃣ Sân đặt nhiều nhất
    const topCourtAgg = await Booking.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$courtId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
    ]);

    let topCourt = null;
    if (topCourtAgg[0]) {
        const court = await Court.findById(topCourtAgg[0]._id).lean();
        topCourt = { court, count: topCourtAgg[0].count };
    }

    // 5️⃣ Doanh thu 7 ngày gần nhất (FIX đúng biến sử dụng)
    const revenue7DaysAgg = await Booking.aggregate([
        { $match: { isDeleted: false } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: { $toDouble: "$price" } } // ✅ ép kiểu sang number
            }
        },
        { $sort: { _id: -1 } },
        { $limit: 7 },
        { $sort: { _id: 1 } }
    ]);

    const totalRevenue = revenue7DaysAgg.reduce((sum, i) => sum + i.revenue, 0);


    const revenueTrend = revenue7DaysAgg.map(i => ({
        date: i._id,
        revenue: i.revenue
    }));

    // 6️⃣ Tỷ lệ sử dụng sân (%)
    const totalUsed = await Booking.countDocuments({ isDeleted: false });
    const totalCourts = await Court.countDocuments();

    const courtRate = totalUsed && totalCourts ?
        Number(((totalUsed / (totalCourts * 10)) * 100).toFixed(1)) :
        0;

    // 7️⃣ Trend lượt đặt theo 7 ngày gần nhất
    const booking7DaysAgg = await Booking.aggregate([
        { $match: { isDeleted: false } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: -1 } },
        { $limit: 7 },
        { $sort: { _id: 1 } }
    ]);

    const bookingTrend = booking7DaysAgg.map(i => ({
        date: i._id,
        count: i.count
    }));

    return {
        hotHour,
        topCustomer,
        topCourt,
        revenueTrend,
        totalRevenue,
        topCustomersList: topCustomersList,
        courtRate,
        hourTrend: bookingTrend // giữ đúng format cho FE
    };
};