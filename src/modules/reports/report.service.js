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
export const getBookingStatsService = async({ period = 'week', offset = '0' } = {}) => {
    const now = new Date();
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const allBookings = await Booking.find({ isDeleted: false }).lean();
    
    let dailyRevenue = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let bookingsToday = 0;
    let bookingsWeek = 0;
    let bookingsMonth = 0;
    
    const courtsMap = {};
    const customersMap = {};
    const peakHoursMap = {};
    let inUse = 0;
    let reserved = 0;
    const revenueByDate = {};

    for (const b of allBookings) {
        // Dùng b.date (Ngày khách đến đá) làm mốc thời gian chính. Nếu không có thì fallback createdAt
        const targetDate = new Date(b.date || b.createdAt);
        
        // Tạo chuỗi YYYY-MM-DD theo giờ local (VN) để biểu đồ gom nhóm chính xác
        const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        
        // Revenue
        const amount = b.total || 0;
        if (b.paymentStatus === 'paid') { // Khi admin bấm thanh toán -> paymentStatus = 'paid'
            totalPaid += amount;
            if (targetDate >= startOfToday) dailyRevenue += amount;
            
            revenueByDate[dateStr] = (revenueByDate[dateStr] || 0) + amount;
        } else {
            totalUnpaid += amount;
        }
        
        // Bookings overview
        if (targetDate >= startOfToday) bookingsToday++;
        if (targetDate >= startOfWeek) bookingsWeek++;
        if (targetDate >= startOfMonth) bookingsMonth++;
        
        // Courts stats
        if (b.courtId) {
            courtsMap[b.courtId] = (courtsMap[b.courtId] || 0) + 1;
        }
        
        // Customers stats
        if (b.customerInfo && b.customerInfo.phone) {
            const phone = b.customerInfo.phone;
            if (!customersMap[phone]) {
                customersMap[phone] = { user: b.customerInfo, count: 0, firstDate: targetDate };
            }
            customersMap[phone].count++;
            if (targetDate < customersMap[phone].firstDate) {
                customersMap[phone].firstDate = targetDate;
            }
        }
        
        // Peak hours
        if (b.startTime) {
            peakHoursMap[b.startTime] = (peakHoursMap[b.startTime] || 0) + 1;
        }
        
        // Court status
        if (b.status === 'in_use') inUse++;
        else if (b.status === 'pending' || b.status === 'confirmed') reserved++;
    }

    // Process Courts Stats
    const courtIds = Object.keys(courtsMap);
    const courtsData = await Court.find({ _id: { $in: courtIds } }).lean();
    const courtNameMap = {};
    courtsData.forEach(c => courtNameMap[c._id.toString()] = c.name);
    
    const courtsStats = courtIds.map(id => ({
        name: courtNameMap[id] || 'Sân không xác định',
        count: courtsMap[id]
    })).sort((a, b) => b.count - a.count);

    // Process Customer Stats
    const customers = Object.values(customersMap);
    const newThisMonth = customers.filter(c => c.firstDate >= startOfMonth).length;
    const topList = customers.sort((a, b) => b.count - a.count).slice(0, 5);

    // Process Peak Hours
    const peakHours = Object.keys(peakHoursMap).map(time => ({
        time,
        count: peakHoursMap[time]
    })).sort((a, b) => b.count - a.count);

    // Court Status available
    const totalCourts = await Court.countDocuments();
    const available = Math.max(0, totalCourts - inUse - reserved);

    // Revenue Trend
    const revenueTrend = Object.keys(revenueByDate).map(date => ({
        date,
        revenue: revenueByDate[date]
    })).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-7);

    return {
        revenueOverview: {
            daily: dailyRevenue,
            totalPaid,
            totalUnpaid
        },
        bookingsOverview: {
            today: bookingsToday,
            week: bookingsWeek,
            month: bookingsMonth
        },
        courtsStats,
        customerStats: {
            total: customers.length,
            newThisMonth,
            topList
        },
        peakHours,
        courtStatus: {
            inUse,
            reserved,
            available
        },
        revenueTrend,
        totalRevenue: totalPaid
    };
};