// controllers/review.controllers.js

import handleAsync from "../../utils/handleAsync.js";
import createError from "../../utils/error.js";
import createResponse from "../../utils/responses.js";

import Review from "./review.models.js";
import Booking from "../bookings/booking.models.js";

import { BOOKING_STATUS, PAYMENT_STATUS, USER_ROLES } from "../../common/constants/enums.js";

export const createReview = handleAsync(async (req, res, next) => {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user._id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(createError(404, "Không tìm thấy booking"));

    // Check điều kiện được đánh giá
    if (booking.status !== BOOKING_STATUS.COMPLETED ||
        booking.paymentStatus !== PAYMENT_STATUS.PAID) {
        return next(createError(400, "Bạn chỉ được đánh giá khi đơn đã hoàn thành và đã thanh toán"));
    }

    // Confirm booking belongs to user
    if (String(booking.customerId) !== String(userId)) {
        return next(createError(403, "Không thể đánh giá booking không thuộc về bạn"));
    }

    // Prevent duplicate review
    const exist = await Review.findOne({ bookingId });
    if (exist) return next(createError(400, "Booking này đã được đánh giá"));

    const review = await Review.create({
        bookingId,
        userId,
        courtId: booking.courtId,
        rating,
        comment,
    });

    return res.json(createResponse(true, 201, "Đánh giá thành công", review));
});

export const getMyReviews = handleAsync(async (req, res, next) => {
    const userId = req.user._id;

    const reviews = await Review.find({ userId })
        .populate("courtId bookingId");

    return res.json(createResponse(true, 200, "Danh sách đánh giá của bạn", reviews));
});

export const adminGetReviews = handleAsync(async (req, res, next) => {
    const { page = 1, limit = 20, status, courtId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (courtId) query.courtId = courtId;

    const reviews = await Review.find(query)
        .populate("userId courtId bookingId")
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .sort({ createdAt: -1 });

    const total = await Review.countDocuments(query);

    return res.json(
        createResponse(true, 200, "Danh sách đánh giá", {
            reviews,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / limit),
            },
        })
    );
});

export const updateReview = handleAsync(async (req, res, next) => {
    const reviewId = req.params.id;
    const { rating, comment } = req.body;
    const userId = req.user._id;
    const role = req.user.role;

    const review = await Review.findById(reviewId);
    if (!review) return next(createError(404, "Không tìm thấy review"));

    if (role !== USER_ROLES.ADMIN && String(review.userId) !== String(userId)) {
        return next(createError(403, "Không có quyền sửa đánh giá này"));
    }

    review.rating = rating ?? review.rating;
    review.comment = comment ?? review.comment;
    await review.save();

    return res.json(createResponse(true, 200, "Cập nhật đánh giá thành công", review));
});

export const deleteReview = handleAsync(async (req, res, next) => {
    const reviewId = req.params.id;
    const userId = req.user._id;
    const role = req.user.role;

    const review = await Review.findById(reviewId);
    if (!review) return next(createError(404, "Không tìm thấy review"));

    if (role !== USER_ROLES.ADMIN && String(review.userId) !== String(userId)) {
        return next(createError(403, "Không có quyền xóa đánh giá này"));
    }

    await review.deleteOne();

    return res.json(createResponse(true, 200, "Xóa đánh giá thành công"));
});

export const getFieldsNeedReview = async (req, res) => {
    try {
        const userId = req.params.id;

        // 1. Booking completed + paid
        const bookings = await Booking.find({
            customerId: userId,
            status: BOOKING_STATUS.COMPLETED,
            paymentStatus: PAYMENT_STATUS.PAID
        })
            .select("_id courtId date startTime endTime total")
            .populate("courtId", "_id name type images")
            .lean();

        if (!bookings.length) {
            return res.json({
                reviewedCourts: [],
                unreviewedCourts: { total: 0, items: [] }
            });
        }

        const bookingIds = bookings.map(b => b._id.toString());

        // 2. Lấy review theo bookingId
        const reviews = await Review.find({
            userId,
            bookingId: { $in: bookingIds }
        })
            .select("_id bookingId")
            .lean();

        // map bookingId -> reviewId
        const reviewMap = {};
        reviews.forEach(r => {
            reviewMap[r.bookingId.toString()] = r._id;
        });

        // 3. Tách reviewed / unreviewed
        const reviewedCourts = bookings
            .filter(b => reviewMap[b._id.toString()])
            .map(b => ({
                ...b,
                reviewId: reviewMap[b._id.toString()] // ⭐ QUAN TRỌNG
            }));

        const unreviewedCourts = bookings.filter(
            b => !reviewMap[b._id.toString()]
        );

        return res.json({
            reviewedCourts,
            unreviewedCourts: {
                total: unreviewedCourts.length,
                items: unreviewedCourts
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};


export const getReviewDetail = handleAsync(async (req, res, next) => {
    const { id } = req.params;

    const review = await Review.findById(id)
        .populate("courtId", "_id name type images location")
        .populate("bookingId", "code date startTime endTime total")
        .populate("userId", "_id name phone email");

    if (!review) {
        return next(createError(404, "Không tìm thấy đánh giá"));
    }

    return res.json(
        createResponse(true, 200, "Chi tiết đánh giá", review)
    );
});

