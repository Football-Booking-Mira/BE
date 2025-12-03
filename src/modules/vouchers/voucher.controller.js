import mongoose from "mongoose";
import {
  DISCOUNT_TYPES,
  VOUCHER_STATUS,
} from "../../common/constants/enums.js";
import createError from "../../utils/error.js";
import handleAsync from "../../utils/handleAsync.js";
import createResponse from "../../utils/responses.js";
import { Court } from "../courts/court.models.js";
import Voucher from "./voucher.models.js";
import VoucherUsage from "./voucherUsage.models.js";
import {
  getVoucherStatsData,
  normalizeVoucherCode,
  validateVoucherForOrder,
} from "./voucher.service.js";

const ensureValidCourts = (courtIds = []) => {
  if (!courtIds.length) return [];

  const uniqueIds = [...new Set(courtIds)].map((id) => id.trim());
  const invalidId = uniqueIds.find(
    (id) => !mongoose.Types.ObjectId.isValid(id)
  );
  if (invalidId) {
    throw createError(400, `ID sân không hợp lệ: ${invalidId}`);
  }
  return uniqueIds;
};

export const getVouchers = handleAsync(async (req, res) => {
  const { q, status, limit = 50 } = req.query;

  const filters = { isDeleted: { $ne: true } };
  if (typeof q === "string" && q.trim()) {
    filters.code = { $regex: q.trim(), $options: "i" };
  }
  if (typeof status === "string" && status.trim()) {
    filters.status = status.trim();
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const vouchers = await Voucher.find(filters)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .select(
      "code status discountType discountValue maxDiscountValue totalIssued remainingQuantity usageCount startDate endDate createdAt"
    )
    .lean();

  return res.json(
    createResponse(true, 200, "Lấy danh sách voucher thành công!", vouchers)
  );
});

// API Public - Lấy danh sách voucher ACTIVE cho user xem
export const getPublicVouchers = handleAsync(async (req, res) => {
  const userId = req.user?._id; // Có thể null nếu chưa đăng nhập
  const { limit = 20 } = req.query;
  const now = new Date();

  const filters = {
    isDeleted: { $ne: true },
    status: VOUCHER_STATUS.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
    remainingQuantity: { $gt: 0 },
  };

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  // Lấy voucher hợp lệ
  const vouchers = await Voucher.find(filters)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .select(
      "code description discountType discountValue maxDiscountValue minOrderValue remainingQuantity totalIssued startDate endDate applicableCourtTypes timeRestrictions"
    )
    .lean();

  // Tính toán remainingQuantity chính xác từ VoucherUsage nếu cần
  const processedVouchers = await Promise.all(
    vouchers.map(async (voucher) => {
      // Tính lại remainingQuantity từ usage thực tế
      const appliedUsageCount = await VoucherUsage.countDocuments({
        voucherId: voucher._id,
        status: "applied",
      });

      const actualRemaining = Math.max(
        0,
        voucher.totalIssued - appliedUsageCount
      );

      // Lấy số lần user đã dùng voucher này (nếu đã đăng nhập)
      let userUsageCount = 0;
      if (userId) {
        userUsageCount = await VoucherUsage.countDocuments({
          voucherId: voucher._id,
          userId,
          status: "applied",
        });
      }

      return {
        code: voucher.code,
        description: voucher.description || "",
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        maxDiscountValue: voucher.maxDiscountValue,
        minOrderValue: voucher.minOrderValue || 0,
        remainingQuantity: actualRemaining,
        totalIssued: voucher.totalIssued,
        usedCount: appliedUsageCount,
        userUsedCount: userUsageCount, // Số lần user hiện tại đã dùng
        perUserLimit: voucher.perUserLimit || 1,
        startDate: voucher.startDate,
        endDate: voucher.endDate,
        applicableCourtTypes: voucher.applicableCourtTypes || [],
        timeRestrictions: voucher.timeRestrictions || null,
        // Tính toán hiển thị
        discountDisplay:
          voucher.discountType === DISCOUNT_TYPES.PERCENT
            ? `${voucher.discountValue}%${
                voucher.maxDiscountValue
                  ? ` (tối đa ${voucher.maxDiscountValue.toLocaleString(
                      "vi-VN"
                    )}đ)`
                  : ""
              }`
            : `${voucher.discountValue.toLocaleString("vi-VN")}đ`,
      };
    })
  );

  // Lọc chỉ những voucher còn lượt dùng
  const availableVouchers = processedVouchers.filter(
    (v) => v.remainingQuantity > 0
  );

  return res.json(
    createResponse(
      true,
      200,
      "Lấy danh sách voucher thành công!",
      availableVouchers
    )
  );
});

// API Debug - Xem tất cả voucher (không filter) - Chỉ để debug
export const getVouchersDebug = handleAsync(async (req, res) => {
  const allVouchers = await Voucher.find({ isDeleted: { $ne: true } })
    .select(
      "code status startDate endDate remainingQuantity totalIssued createdAt"
    )
    .sort({ createdAt: -1 })
    .lean();

  const now = new Date();
  const debugInfo = allVouchers.map((v) => {
    const isActive = v.status === VOUCHER_STATUS.ACTIVE;
    const isInTimeRange = v.startDate <= now && v.endDate >= now;
    const hasQuantity = v.remainingQuantity > 0;
    const canShow = isActive && isInTimeRange && hasQuantity;

    return {
      code: v.code,
      status: v.status,
      startDate: v.startDate,
      endDate: v.endDate,
      remainingQuantity: v.remainingQuantity,
      totalIssued: v.totalIssued,
      checks: {
        isActive,
        isInTimeRange,
        hasQuantity,
        canShow,
      },
      issues: [
        !isActive && "Status không phải ACTIVE",
        !isInTimeRange && "Ngoài thời gian sử dụng",
        !hasQuantity && "Hết số lượng",
      ].filter(Boolean),
    };
  });

  return res.json(
    createResponse(true, 200, "Debug: Danh sách tất cả voucher", {
      total: allVouchers.length,
      now: now.toISOString(),
      vouchers: debugInfo,
    })
  );
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
    return next(createError(409, "Mã voucher đã tồn tại!"));
  }

  // Validation: Số lượng phát hành
  if (!totalIssued || totalIssued <= 0) {
    return next(
      createError(400, "Số lần sử dụng tối đa phải lớn hơn 0!")
    );
  }

  // Validation: Giá trị đơn hàng tối thiểu
  if (minOrderValue < 0) {
    return next(
      createError(400, "Giá trị đơn hàng tối thiểu phải >= 0!")
    );
  }

  // Validation: Số lần sử dụng mỗi người
  if (!perUserLimit || perUserLimit <= 0) {
    return next(
      createError(400, "Số lần sử dụng mỗi người phải lớn hơn 0!")
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentDate = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return next(
      createError(400, "Thời gian bắt đầu hoặc kết thúc không hợp lệ!")
    );
  }

  // Validation: Ngày kết thúc phải sau ngày hiện tại
  if (end < currentDate) {
    return next(
      createError(
        400,
        "Ngày kết thúc phải sau ngày hiện tại!"
      )
    );
  }

  // Validation: Ngày bắt đầu phải trước ngày kết thúc
  if (start >= end) {
    return next(
      createError(400, "Ngày bắt đầu phải trước ngày kết thúc!")
    );
  }

  if (perUserLimit > totalIssued) {
    return next(
      createError(
        400,
        "Giới hạn mỗi user phải nhỏ hơn hoặc bằng số lượng phát hành!"
      )
    );
  }

  // Validation: Discount type và value
  if (discountType === DISCOUNT_TYPES.PERCENT) {
    if (!discountValue || discountValue <= 0 || discountValue > 100) {
      return next(
        createError(
          400,
          "Phần trăm giảm giá phải lớn hơn 0 và không vượt quá 100!"
        )
      );
    }
    if (!maxDiscountValue || maxDiscountValue <= 0) {
      return next(
        createError(
          400,
          "Giá trị giảm giá tối đa phải lớn hơn 0 khi sử dụng phần trăm!"
        )
      );
    }
  }

  if (discountType === DISCOUNT_TYPES.AMOUNT) {
    if (!discountValue || discountValue <= 0) {
      return next(
        createError(400, "Giá trị giảm giá phải lớn hơn 0!")
      );
    }
    // Validation: Giá trị giảm giá không được lớn hơn giá trị đơn hàng tối thiểu
    if (minOrderValue > 0 && discountValue >= minOrderValue) {
      return next(
        createError(
          400,
          "Giá trị giảm giá phải nhỏ hơn giá trị đơn hàng tối thiểu!"
        )
      );
    }
  }

  const courtIds = ensureValidCourts(applicableCourtIds);
  const courtTypes = Array.isArray(applicableCourtTypes)
    ? [...new Set(applicableCourtTypes)]
    : [];

  const voucher = await Voucher.create({
    code: normalizedCode,
    description: description?.trim() || "",
    discountType,
    discountValue,
    maxDiscountValue:
      discountType === DISCOUNT_TYPES.PERCENT ? maxDiscountValue : null,
    minOrderValue: typeof minOrderValue === "number" ? minOrderValue : 0,
    totalIssued,
    remainingQuantity: totalIssued,
    perUserLimit,
    startDate: start,
    endDate: end,
    applicableCourtIds: courtIds,
    applicableCourtTypes: courtTypes,
    timeRestrictions:
      typeof applicableStartHour === "number" &&
      typeof applicableEndHour === "number"
        ? {
            startHour: applicableStartHour,
            endHour: applicableEndHour,
          }
        : undefined,
    status: status || VOUCHER_STATUS.INACTIVE,
  });

  return res
    .status(201)
    .json(
      createResponse(true, 201, "Tạo voucher thành công!", voucher.toObject())
    );
});

export const validateVoucher = handleAsync(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) {
    return next(createError(401, "Vui lòng đăng nhập để sử dụng voucher!"));
  }

  const { code, orderTotal, courtId, bookingDate, startTime } = req.body;

  const court = await Court.findById(courtId).select("type").lean();
  if (!court) {
    return next(createError(404, "Không tìm thấy sân!"));
  }

  const { voucher, discountAmount, normalizedCode } =
    await validateVoucherForOrder({
      code,
      userId,
      orderTotal,
      courtId,
      courtType: court.type,
      bookingDate,
      startTime,
    });

  return res.json(
    createResponse(true, 200, "Voucher hợp lệ!", {
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
    createResponse(true, 200, "Thống kê voucher thành công!", {
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

export const getVoucherById = handleAsync(async (req, res, next) => {
  const { voucherId } = req.params;

  const voucher = await Voucher.findOne({
    _id: voucherId,
    isDeleted: { $ne: true },
  }).lean();

  if (!voucher) {
    return next(createError(404, "Không tìm thấy voucher!"));
  }

  return res.json(
    createResponse(true, 200, "Lấy thông tin voucher thành công!", voucher)
  );
});

export const updateVoucher = handleAsync(async (req, res, next) => {
  const { voucherId } = req.params;
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
    status,
  } = req.body;

  const voucher = await Voucher.findOne({
    _id: voucherId,
    isDeleted: { $ne: true },
  });

  if (!voucher) {
    return next(createError(404, "Không tìm thấy voucher!"));
  }

  const normalizedCode = normalizeVoucherCode(code);

  // Kiểm tra code trùng (trừ voucher hiện tại)
  if (normalizedCode !== voucher.code) {
    const existed = await Voucher.findOne({ code: normalizedCode });
    if (existed) {
      return next(createError(409, "Mã voucher đã tồn tại!"));
    }
  }

  // Validation: Số lượng phát hành
  if (!totalIssued || totalIssued <= 0) {
    return next(
      createError(400, "Số lần sử dụng tối đa phải lớn hơn 0!")
    );
  }

  // Validation: Giá trị đơn hàng tối thiểu
  if (minOrderValue < 0) {
    return next(
      createError(400, "Giá trị đơn hàng tối thiểu phải >= 0!")
    );
  }

  // Validation: Số lần sử dụng mỗi người
  if (!perUserLimit || perUserLimit <= 0) {
    return next(
      createError(400, "Số lần sử dụng mỗi người phải lớn hơn 0!")
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentDate = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return next(
      createError(400, "Thời gian bắt đầu hoặc kết thúc không hợp lệ!")
    );
  }

  // Validation: Ngày kết thúc phải sau ngày hiện tại
  if (end < currentDate) {
    return next(
      createError(
        400,
        "Ngày kết thúc phải sau ngày hiện tại!"
      )
    );
  }

  // Validation: Ngày bắt đầu phải trước ngày kết thúc
  if (start >= end) {
    return next(
      createError(400, "Ngày bắt đầu phải trước ngày kết thúc!")
    );
  }

  // Kiểm tra số lượng đã sử dụng
  const usedQuantity = voucher.totalIssued - voucher.remainingQuantity;
  if (totalIssued < usedQuantity) {
    return next(
      createError(
        400,
        `Số lượng phát hành mới (${totalIssued}) không được nhỏ hơn số lượng đã sử dụng (${usedQuantity})!`
      )
    );
  }

  if (perUserLimit > totalIssued) {
    return next(
      createError(
        400,
        "Giới hạn mỗi user phải nhỏ hơn hoặc bằng số lượng phát hành!"
      )
    );
  }

  // Validation: Discount type và value
  if (discountType === DISCOUNT_TYPES.PERCENT) {
    if (!discountValue || discountValue <= 0 || discountValue > 100) {
      return next(
        createError(
          400,
          "Phần trăm giảm giá phải lớn hơn 0 và không vượt quá 100!"
        )
      );
    }
    if (!maxDiscountValue || maxDiscountValue <= 0) {
      return next(
        createError(
          400,
          "Giá trị giảm giá tối đa phải lớn hơn 0 khi sử dụng phần trăm!"
        )
      );
    }
  }

  if (discountType === DISCOUNT_TYPES.AMOUNT) {
    if (!discountValue || discountValue <= 0) {
      return next(
        createError(400, "Giá trị giảm giá phải lớn hơn 0!")
      );
    }
    // Validation: Giá trị giảm giá không được lớn hơn giá trị đơn hàng tối thiểu
    if (minOrderValue > 0 && discountValue >= minOrderValue) {
      return next(
        createError(
          400,
          "Giá trị giảm giá phải nhỏ hơn giá trị đơn hàng tối thiểu!"
        )
      );
    }
  }

  const courtIds = ensureValidCourts(applicableCourtIds);
  const courtTypes = Array.isArray(applicableCourtTypes)
    ? [...new Set(applicableCourtTypes)]
    : [];

  // Cập nhật remainingQuantity nếu totalIssued thay đổi
  const newRemainingQuantity =
    totalIssued - usedQuantity >= 0
      ? totalIssued - usedQuantity
      : voucher.remainingQuantity;

  voucher.code = normalizedCode;
  voucher.description = description?.trim() || "";
  voucher.discountType = discountType;
  voucher.discountValue = discountValue;
  voucher.maxDiscountValue =
    discountType === DISCOUNT_TYPES.PERCENT ? maxDiscountValue : null;
  voucher.minOrderValue = typeof minOrderValue === "number" ? minOrderValue : 0;
  voucher.totalIssued = totalIssued;
  voucher.remainingQuantity = newRemainingQuantity;
  voucher.perUserLimit = perUserLimit;
  voucher.startDate = start;
  voucher.endDate = end;
  voucher.applicableCourtIds = courtIds;
  voucher.applicableCourtTypes = courtTypes;
  voucher.timeRestrictions =
    typeof applicableStartHour === "number" &&
    typeof applicableEndHour === "number"
      ? {
          startHour: applicableStartHour,
          endHour: applicableEndHour,
        }
      : undefined;
  if (status !== undefined) {
    voucher.status = status;
  }

  await voucher.save();

  return res.json(
    createResponse(
      true,
      200,
      "Cập nhật voucher thành công!",
      voucher.toObject()
    )
  );
});

export const deleteVoucher = handleAsync(async (req, res, next) => {
  const { voucherId } = req.params;

  // Xóa hẳn voucher khỏi database (hard delete)
  // Đồng thời dọn các bản ghi usage liên quan để tránh dữ liệu mồ côi
  const voucher = await Voucher.findOne({ _id: voucherId });

  if (!voucher) {
    return next(createError(404, "Không tìm thấy voucher!"));
  }

  await VoucherUsage.deleteMany({ voucherId: voucher._id });
  await Voucher.deleteOne({ _id: voucher._id });

  return res.json(
    createResponse(true, 200, "Xóa voucher (hard delete) thành công!", null)
  );
});

export default {
  getVouchers,
  getPublicVouchers,
  getVouchersDebug,
  createVoucher,
  validateVoucher,
  getVoucherStats,
  getVoucherById,
  updateVoucher,
  deleteVoucher,
};
