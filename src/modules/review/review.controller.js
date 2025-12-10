// controllers/review.controllers.js

import handleAsync from "../../utils/handleAsync.js";
import createError from "../../utils/error.js";
import createResponse from "../../utils/responses.js";

import Review from "./review.models.js";
import Booking from "../bookings/booking.models.js";

import { BOOKING_STATUS, PAYMENT_STATUS, USER_ROLES } from "../../common/constants/enums.js";

/**
 * CREATE REVIEW
 */
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

/**
 * GET reviews của user
 */
export const getMyReviews = handleAsync(async (req, res, next) => {
    const userId = req.user._id;

    const reviews = await Review.find({ userId })
        .populate("courtId bookingId");

    return res.json(createResponse(true, 200, "Danh sách đánh giá của bạn", reviews));
});

/**
 * ADMIN: GET all reviews
 */
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

/**
 * UPDATE REVIEW (user only unless admin)
 */
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

/**
 * DELETE REVIEW
 */
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

        // 1. Lấy booking completed + paid
        const bookings = await Booking.find({
            customerId: userId,
            status: BOOKING_STATUS.COMPLETED,
            paymentStatus: PAYMENT_STATUS.PAID
        })
            .select("courtId date startTime endTime total")
            .populate("courtId", "_id name type images")   // populate!
            .lean();

        if (!bookings.length) {
            return res.json({
                reviewedCourts: [],
                unreviewedCourts: []
            });
        }

        // Lấy đúng courtId._id
        const courtIds = bookings.map(b => b.courtId?._id.toString());

        // 2. Lấy review user đã viết
        const reviews = await Review.find({
            userId,
            courtId: { $in: courtIds }
        })
            .select("courtId")
            .lean();

        const reviewedIds = reviews.map(r => r.courtId.toString());

        // 3. Tách 2 nhóm
        const reviewedCourts = bookings.filter(
            b => reviewedIds.includes(b.courtId._id.toString())
        );

        const unreviewedCourts = bookings.filter(
            b => !reviewedIds.includes(b.courtId._id.toString())
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



