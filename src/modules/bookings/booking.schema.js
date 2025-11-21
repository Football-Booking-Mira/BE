import Joi from "joi";

export const bookingValidation = {
  create: Joi.object({
    // Mã đặt sân — không bắt buộc vì backend có thể tự sinh
    code: Joi.string()
      .pattern(/^DS\d{8}$/)
      .message("Mã đặt sân phải có dạng DSxxxxxxxx")
      .optional(),

    customerId: Joi.string().allow(null, ""),
    courtId: Joi.string().required(),

    date: Joi.date().required().messages({
      "date.base": "Ngày chơi không hợp lệ",
    }),

    startTime: Joi.string()
      .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
      .required()
      .messages({
        "string.pattern.base": "Giờ bắt đầu phải có định dạng HH:mm",
      }),

    endTime: Joi.string()
      .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
      .required()
      .messages({
        "string.pattern.base": "Giờ kết thúc phải có định dạng HH:mm",
      }),

    // ❌ Không bắt buộc — model tự tính
    hours: Joi.number().min(0.5).optional(),

    fieldAmount: Joi.number().min(0).required(),
    equipmentTotal: Joi.number().min(0).default(0),
    discountTotal: Joi.number().min(0).default(0),

    // ❌ Không bắt buộc — model tự tính
    total: Joi.number().min(0).optional(),

    status: Joi.string()
      .valid("pending", "confirmed", "in_use", "completed", "cancelled", "no_show")
      .default("pending"),

    paymentStatus: Joi.string()
      .valid("unpaid", "partial", "paid", "refunded")
      .default("unpaid"),

    depositRequired: Joi.boolean().default(false),
    depositAmount: Joi.number().min(0).default(0),
    depositStatus: Joi.string()
      .valid("pending", "paid", "refunded", "forfeited")
      .default("pending"),
    depositMethod: Joi.string().valid("cash", "transfer", "momo", "vnpay", "qr"),
    depositTxnId: Joi.string().allow("", null),

    checkinAt: Joi.date().allow(null),
    checkoutAt: Joi.date().allow(null),
    notes: Joi.string().max(1000).allow("", null),
    cancelReason: Joi.string().max(500).allow("", null),
  }),

  update: Joi.object({
    status: Joi.string().valid(
      "pending",
      "confirmed",
      "in_use",
      "completed",
      "cancelled",
      "no_show"
    ),
    paymentStatus: Joi.string().valid("unpaid", "partial", "paid", "refunded"),
    depositStatus: Joi.string().valid("pending", "paid", "refunded", "forfeited"),
    depositTxnId: Joi.string().allow("", null),
    notes: Joi.string().max(1000).allow("", null),
    cancelReason: Joi.string().max(500).allow("", null),
  }),

  checkin: Joi.object({
    bookingId: Joi.string().required(),
    checkinAt: Joi.date().required(),
  }),

  checkout: Joi.object({
    bookingId: Joi.string().required(),
    checkoutAt: Joi.date().required(),
  }),
};
