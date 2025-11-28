import mongoose from 'mongoose';
import { DISCOUNT_TYPES, VOUCHER_STATUS } from '../../common/constants/enums.js';
import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import { Court } from '../courts/court.models.js';
import Voucher from './voucher.models.js';
import {
    getVoucherStatsData,
    normalizeVoucherCode,
    validateVoucherForOrder,
} from './voucher.service.js';

const ensureValidCourts = (courtIds = []) => {
    if (!courtIds.length) return [];

    const uniqueIds = [...new Set(courtIds)].map((id) => id.trim());
    const invalidId = uniqueIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) {
        throw createError(400, `ID sân không hợp lệ: ${invalidId}`);
    }
    return uniqueIds;
};

export const getVouchers = handleAsync(async (req, res) => {
    const { q, status, limit = 50 } = req.query;

    const filters = { isDeleted: { $ne: true } };
    if (typeof q === 'string' && q.trim()) {
        filters.code = { $regex: q.trim(), $options: 'i' };
    }
    if (typeof status === 'string' && status.trim()) {
        filters.status = status.trim();
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const vouchers = await Voucher.find(filters)
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .select(
            'code status discountType discountValue maxDiscountValue totalIssued remainingQuantity usageCount startDate endDate createdAt'
        )
        .lean();

    return res.json(createResponse(true, 200, 'Lấy danh sách voucher thành công!', vouchers));
});

export const createVoucher = handleAsync(async (req, res, next) => {
    const {
        code,
        description,
        discountType,
        discountValue,
        maxDiscountValue,
        minOrderValue = 0,
        totalIssued,
        perUserLimit,
        startDate,
        endDate,
        applicableCourtIds = [],
        applicableCourtTypes = [],
        applicableStartHour,
        applicableEndHour,
        status = VOUCHER_STATUS.ACTIVE,
    } = req.body;

    const normalizedCode = normalizeVoucherCode(code);

    const existed = await Voucher.findOne({ code: normalizedCode });
    if (existed) {
        return next(createError(409, 'Mã voucher đã tồn tại!'));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return next(createError(400, 'Thời gian bắt đầu hoặc kết thúc không hợp lệ!'));
    }
    if (end <= start) {
        return next(createError(400, 'Thời gian kết thúc phải sau thời gian bắt đầu!'));
    }

    if (perUserLimit > totalIssued) {
        return next(
            createError(400, 'Giới hạn mỗi user phải nhỏ hơn hoặc bằng số lượng phát hành!')
        );
    }

    if (discountType === DISCOUNT_TYPES.PERCENT) {
        if (discountValue > 100) {
            return next(createError(400, 'Voucher giảm % không được vượt quá 100!'));
        }
        if (typeof maxDiscountValue !== 'number') {
            return next(createError(400, 'Vui lòng nhập giá trị giảm tối đa cho voucher %!'));
        }
    }

    const courtIds = ensureValidCourts(applicableCourtIds);
    const courtTypes = Array.isArray(applicableCourtTypes)
        ? [...new Set(applicableCourtTypes)]
        : [];

    const voucher = await Voucher.create({
        code: normalizedCode,
        description: description?.trim() || '',
        discountType,
        discountValue,
        maxDiscountValue: discountType === DISCOUNT_TYPES.PERCENT ? maxDiscountValue : null,
        minOrderValue: typeof minOrderValue === 'number' ? minOrderValue : 0,
        totalIssued,
        remainingQuantity: totalIssued,
        perUserLimit,
        startDate: start,
        endDate: end,
        applicableCourtIds: courtIds,
        applicableCourtTypes: courtTypes,
        timeRestrictions:
            typeof applicableStartHour === 'number' && typeof applicableEndHour === 'number'
                ? {
                      startHour: applicableStartHour,
                      endHour: applicableEndHour,
                  }
                : undefined,
        status: status || VOUCHER_STATUS.INACTIVE,
    });

    return res
        .status(201)
        .json(createResponse(true, 201, 'Tạo voucher thành công!', voucher.toObject()));
});

export const validateVoucher = handleAsync(async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) {
        return next(createError(401, 'Vui lòng đăng nhập để sử dụng voucher!'));
    }

    const { code, orderTotal, courtId, bookingDate, startTime } = req.body;

    const court = await Court.findById(courtId).select('type').lean();
    if (!court) {
        return next(createError(404, 'Không tìm thấy sân!'));
    }

    const { voucher, discountAmount, normalizedCode } = await validateVoucherForOrder({
        code,
        userId,
        orderTotal,
        courtId,
        courtType: court.type,
        bookingDate,
        startTime,
    });

    return res.json(
        createResponse(true, 200, 'Voucher hợp lệ!', {
            voucherId: voucher._id,
            code: normalizedCode,
            discountAmount,
            orderTotal,
            orderTotalAfterDiscount: Math.max(0, orderTotal - discountAmount),
            remainingQuantity: voucher.remainingQuantity,
            perUserLimit: voucher.perUserLimit,
            minOrderValue: voucher.minOrderValue,
            startDate: voucher.startDate,
            endDate: voucher.endDate,
        })
    );
});

export const getVoucherStats = handleAsync(async (req, res, next) => {
    const { voucherId } = req.params;
    const data = await getVoucherStatsData(voucherId);

    return res.json(
        createResponse(true, 200, 'Thống kê voucher thành công!', {
            voucher: data.voucher,
            totals: {
                issued: data.voucher.totalIssued,
                remaining: data.voucher.remainingQuantity,
                used: data.totals.totalApplied,
                restored: data.totals.totalRestored,
                discountGiven: data.totals.discountGiven,
            },
            users: data.userUsage,
            bookings: data.bookingUsages,
        })
    );
});

export default {
    getVouchers,
    createVoucher,
    validateVoucher,
    getVoucherStats,
};

