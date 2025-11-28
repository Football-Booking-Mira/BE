import mongoose from "mongoose";
import {
  COURT_TYPES,
  DISCOUNT_TYPES,
  VOUCHER_STATUS,
} from "../../common/constants/enums.js";
import createError from "../../utils/error.js";
import Voucher from "./voucher.models.js";
import VoucherUsage from "./voucherUsage.models.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const normalizeVoucherCode = (code = "") => code.trim().toUpperCase();

const ensureUser = (userId) => {
  if (!userId || !isValidObjectId(userId)) {
    throw createError(401, "Vui lòng đăng nhập để sử dụng voucher!");
  }
  return userId;
};

const ensurePositiveNumber = (value, message) => {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw createError(400, message);
  }
  return value;
};

const ensureCourtMatches = (voucher, courtId, courtType) => {
  if (voucher.applicableCourtIds?.length) {
    if (!courtId || !isValidObjectId(courtId)) {
      throw createError(400, "Voucher yêu cầu chọn sân cụ thể!");
    }
    const matched = voucher.applicableCourtIds.some(
      (id) => String(id) === String(courtId)
    );
    if (!matched) {
      throw createError(400, "Voucher không áp dụng cho sân đã chọn!");
    }
  }

  if (voucher.applicableCourtTypes?.length) {
    if (!courtType || !Object.values(COURT_TYPES).includes(courtType)) {
      throw createError(
        400,
        "Không xác định được loại sân để áp dụng voucher!"
      );
    }
    if (!voucher.applicableCourtTypes.includes(courtType)) {
      throw createError(400, "Voucher không áp dụng cho loại sân này!");
    }
  }
};

const ensureTimeMatches = (voucher, startTime) => {
  if (!voucher.timeRestrictions || !voucher.timeRestrictions.startHour) return;
  if (!startTime) {
    throw createError(400, "Vui lòng chọn giờ bắt đầu để áp dụng voucher!");
  }

  const [hours, minutes] = startTime.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    hours < 0 ||
    hours > 23 ||
    Number.isNaN(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw createError(400, "Giờ bắt đầu không hợp lệ!");
  }

  const { startHour, endHour } = voucher.timeRestrictions;
  if (typeof startHour === "number" && typeof endHour === "number") {
    if (hours < startHour || hours >= endHour) {
      throw createError(
        400,
        `Voucher chỉ áp dụng trong khung giờ ${startHour}:00 - ${endHour}:00`
      );
    }
  }
};

export const calculateVoucherDiscount = (voucher, orderTotal) => {
  ensurePositiveNumber(orderTotal, "Tổng tiền đơn phải lớn hơn 0!");
  if (voucher.discountType === DISCOUNT_TYPES.PERCENT) {
    const raw = (orderTotal * voucher.discountValue) / 100;
    const capped =
      typeof voucher.maxDiscountValue === "number"
        ? Math.min(raw, voucher.maxDiscountValue)
        : raw;
    return Math.min(orderTotal, Math.max(0, Math.floor(capped)));
  }

  const amount = Math.min(orderTotal, voucher.discountValue);
  return Math.max(0, amount);
};

export const validateVoucherForOrder = async ({
  code,
  userId,
  orderTotal,
  courtId,
  courtType,
  bookingDate,
  startTime,
}) => {
  const normalizedCode = normalizeVoucherCode(code);
  ensureUser(userId);
  const amount = ensurePositiveNumber(
    orderTotal,
    "Tổng tiền đơn phải lớn hơn 0!"
  );

  const voucher = await Voucher.findOne({
    code: normalizedCode,
    status: VOUCHER_STATUS.ACTIVE,
    isDeleted: { $ne: true },
  });

  if (!voucher) {
    throw createError(404, "Voucher không tồn tại hoặc đã bị vô hiệu!");
  }

  if (voucher.remainingQuantity <= 0) {
    throw createError(400, "Voucher đã hết lượt sử dụng!");
  }

  const now = new Date();
  const compareDate = bookingDate ? new Date(bookingDate) : now;
  if (compareDate < voucher.startDate) {
    throw createError(400, "Voucher chưa đến thời gian sử dụng!");
  }
  if (compareDate > voucher.endDate) {
    throw createError(400, "Voucher đã hết hạn!");
  }

  if (voucher.minOrderValue && amount < voucher.minOrderValue) {
    throw createError(
      400,
      `Đơn hàng phải đạt tối thiểu ${voucher.minOrderValue.toLocaleString(
        "vi-VN"
      )}đ để dùng voucher!`
    );
  }

  ensureCourtMatches(voucher, courtId, courtType);
  ensureTimeMatches(voucher, startTime);

  const userUsageCount = await VoucherUsage.countDocuments({
    voucherId: voucher._id,
    userId,
    status: "applied",
  });

  if (userUsageCount >= voucher.perUserLimit) {
    throw createError(400, "Bạn đã sử dụng voucher này vượt giới hạn!");
  }

  const discountAmount = calculateVoucherDiscount(voucher, amount);
  if (discountAmount <= 0) {
    throw createError(400, "Không thể tính được số tiền giảm phù hợp!");
  }

  return {
    voucher,
    discountAmount,
    normalizedCode,
  };
};

export const commitVoucherUsage = async ({
  voucherId,
  bookingId,
  userId,
  discountAmount,
  orderTotal,
}) => {
  const updated = await Voucher.findOneAndUpdate(
    { _id: voucherId, remainingQuantity: { $gte: 1 } },
    {
      $inc: { remainingQuantity: -1, usageCount: 1 },
    },
    { new: true }
  );

  if (!updated) {
    throw createError(409, "Voucher đã hết lượt sử dụng!");
  }

  const usage = await VoucherUsage.create({
    voucherId,
    userId,
    bookingId,
    discountAmount,
    orderTotal,
  });

  return usage;
};

export const restoreVoucherUsage = async (booking) => {
  if (!booking?.voucherUsageId) return null;

  const usage = await VoucherUsage.findOneAndUpdate(
    { _id: booking.voucherUsageId, status: "applied" },
    { status: "restored", restoredAt: new Date() },
    { new: true }
  );

  if (!usage) return null;

  await Voucher.findByIdAndUpdate(usage.voucherId, {
    $inc: { remainingQuantity: 1, usageCount: -1 },
  });

  return usage;
};

export const getVoucherStatsData = async (voucherId) => {
  if (!isValidObjectId(voucherId))
    throw createError(400, "Voucher không hợp lệ!");

  const voucher = await Voucher.findById(voucherId).lean();
  if (!voucher) throw createError(404, "Không tìm thấy voucher!");

  const usageStats = await VoucherUsage.aggregate([
    { $match: { voucherId: voucher._id } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalDiscount: { $sum: "$discountAmount" },
      },
    },
  ]);

  const totals = usageStats.reduce(
    (acc, curr) => {
      if (curr._id === "applied") {
        acc.totalApplied = curr.count;
        acc.discountGiven = curr.totalDiscount;
      }
      if (curr._id === "restored") {
        acc.totalRestored = curr.count;
      }
      return acc;
    },
    { totalApplied: 0, totalRestored: 0, discountGiven: 0 }
  );

  const userUsage = await VoucherUsage.aggregate([
    { $match: { voucherId: voucher._id, status: "applied" } },
    {
      $group: {
        _id: "$userId",
        totalDiscount: { $sum: "$discountAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalDiscount: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        totalDiscount: 1,
        count: 1,
        user: {
          _id: "$user._id",
          name: "$user.name",
          email: "$user.email",
          phone: "$user.phone",
        },
      },
    },
  ]);

  const bookingUsages = await VoucherUsage.find({ voucherId: voucher._id })
    .populate("bookingId", "code total status date customerId voucherDiscount")
    .populate("userId", "name email phone")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    voucher,
    totals,
    userUsage,
    bookingUsages,
  };
};
