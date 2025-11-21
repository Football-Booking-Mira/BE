import Booking from "./booking.models.js";
import mongoose from "mongoose";
import { bookingValidation } from "./booking.schema.js";
import {
  generateBookingCode,
  isBookingOwner,
  isAdminUser,
  canCancelWithinWindow,
} from "./booking.utils.js";
import {
  composeBookingDetail,
  pushStatusChange,
} from "./booking.helpers.js";
import { CANCEL_BEFORE_HOURS, PAYMENT_STATUSES } from "./booking.constants.js";

export async function createBookingService(req) {
  if (!req.body.code) {
    req.body.code = generateBookingCode();
  }

  const { error, value } = bookingValidation.create.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    throw {
      status: 400,
      message: "Dữ liệu không hợp lệ",
      errors: error.details.map((d) => d.message),
    };
  }

  if (!value.customerId && req.user?._id) {
    value.customerId = req.user._id;
  }

  const existing = await Booking.findOne({
    courtId: value.courtId,
    date: value.date,
    startTime: value.startTime,
    endTime: value.endTime,
  });

  if (existing) {
    throw {
      status: 400,
      message: "Khung giờ này đã được đặt trước",
    };
  }

  const booking = await Booking.create(value);
  return booking;
}

export async function getAllBookingsService(query) {
  const { date, courtId, status, page = 1, limit = 10 } = query;
  const filter = {};

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    filter.date = { $gte: startOfDay, $lte: endOfDay };
  }

  if (courtId) filter.courtId = courtId;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const bookings = await Booking.find(filter)
    .populate("customerId", "name phone email username")
    .populate("courtId", "name code type basePrice peakPrice images")
    .sort({ date: -1, startTime: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(filter);

  const bookingsData = bookings.map((booking) =>
    composeBookingDetail(booking)
  );

  return {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
    data: bookingsData,
  };
}

export async function getMyBookingsService(req) {
  if (!req.user) {
    throw {
      status: 401,
      message: "Bạn cần đăng nhập để xem đơn đặt sân",
    };
  }

  const userId = req.user._id || req.user.id;
  if (!userId) {
    throw {
      status: 401,
      message: "Không tìm thấy thông tin người dùng",
    };
  }

  const { date, status, paymentStatus, page = 1, limit = 10 } = req.query;
  const filter = {
    customerId: userId,
  };

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    filter.date = { $gte: startOfDay, $lte: endOfDay };
  }

  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  const skip = (page - 1) * limit;

  const bookings = await Booking.find(filter)
    .populate("customerId", "name phone email username")
    .populate("courtId", "name code type basePrice peakPrice images")
    .sort({ date: -1, startTime: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(filter);

  const bookingsData = bookings.map((booking) =>
    composeBookingDetail(booking)
  );

  return {
    message: "Lấy danh sách đơn đặt sân thành công",
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
    data: bookingsData,
  };
}

export async function getBookingByIdService(id, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  if (!user) {
    throw {
      status: 401,
      message: "Bạn cần đăng nhập để xem đơn đặt sân",
    };
  }

  const booking = await Booking.findById(id)
    .populate("customerId", "name phone email")
    .populate("courtId", "name code type basePrice peakPrice images");

  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  const isOwner = isBookingOwner(booking, user);
  const isAdmin = isAdminUser(user);

  if (!isOwner && !isAdmin) {
    throw {
      status: 403,
      message: "Bạn không có quyền xem đơn đặt sân này",
    };
  }

  return composeBookingDetail(booking);
}

export async function getAdminBookingDetailService(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const booking = await Booking.findById(id)
    .populate("customerId", "name phone email username")
    .populate("courtId", "name code type basePrice peakPrice images")
    .populate("statusHistory.changedBy", "name username email role")
    .populate("adminNotes.createdBy", "name username email role");

  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  return composeBookingDetail(booking, { includeAdminFields: true });
}

export async function adminConfirmBookingService(id, body, req) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const { note = "", paymentStatus } = body || {};
  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
    throw {
      status: 400,
      message: "Trạng thái thanh toán không hợp lệ",
    };
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }
  if (booking.status !== "pending") {
    throw {
      status: 400,
      message: "Chỉ xác nhận được đơn đang ở trạng thái PENDING",
    };
  }

  await pushStatusChange({
    booking,
    nextStatus: "confirmed",
    req,
    action: "admin_confirm",
    note,
    mutate: (doc) => {
      if (paymentStatus) {
        doc.paymentStatus = paymentStatus;
      }
    },
  });

  await booking.populate([
    { path: "customerId", select: "name phone email username" },
    { path: "courtId", select: "name code type basePrice peakPrice images" },
    { path: "statusHistory.changedBy", select: "name username email role" },
    { path: "adminNotes.createdBy", select: "name username email role" },
  ]);

  return composeBookingDetail(booking, { includeAdminFields: true });
}

export async function adminCancelBookingService(id, body, req) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const { reason = "" } = body || {};

  const booking = await Booking.findById(id);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }
  if (["in_use", "completed"].includes(booking.status)) {
    throw {
      status: 400,
      message: "Không thể hủy booking đã sử dụng hoặc hoàn tất",
    };
  }
  if (booking.status === "cancelled") {
    return composeBookingDetail(booking, { includeAdminFields: true });
  }

  await pushStatusChange({
    booking,
    nextStatus: "cancelled",
    req,
    action: "admin_cancel",
    note: reason,
    mutate: (doc) => {
      doc.cancelReason = reason || doc.cancelReason || "Admin đã hủy đơn.";
      if (["paid", "partial"].includes(doc.paymentStatus)) {
        doc.paymentStatus = "refunded";
      }
      if (doc.depositStatus === "paid") {
        doc.depositStatus = "refunded";
      }
    },
  });

  await booking.populate([
    { path: "customerId", select: "name phone email username" },
    { path: "courtId", select: "name code type basePrice peakPrice images" },
    { path: "statusHistory.changedBy", select: "name username email role" },
    { path: "adminNotes.createdBy", select: "name username email role" },
  ]);

  return composeBookingDetail(booking, { includeAdminFields: true });
}

export async function adminCheckinBookingService(id, body, req) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const { checkinAt } = body || {};
  const booking = await Booking.findById(id);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }
  if (booking.status !== "confirmed") {
    throw {
      status: 400,
      message: "Chỉ có thể check-in đơn CONFIRMED",
    };
  }

  const timestamp = checkinAt ? new Date(checkinAt) : new Date();

  await pushStatusChange({
    booking,
    nextStatus: "in_use",
    req,
    action: "admin_checkin",
    mutate: (doc) => {
      doc.checkinAt = timestamp;
    },
  });

  await booking.populate([
    { path: "customerId", select: "name phone email username" },
    { path: "courtId", select: "name code type basePrice peakPrice images" },
    { path: "statusHistory.changedBy", select: "name username email role" },
    { path: "adminNotes.createdBy", select: "name username email role" },
  ]);

  return composeBookingDetail(booking, { includeAdminFields: true });
}

export async function adminCompleteBookingService(id, body, req) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const { checkoutAt, note = "" } = body || {};
  const booking = await Booking.findById(id);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }
  if (booking.status !== "in_use") {
    throw {
      status: 400,
      message: "Chỉ có thể hoàn thành đơn đang IN_USE",
    };
  }

  const timestamp = checkoutAt ? new Date(checkoutAt) : new Date();

  await pushStatusChange({
    booking,
    nextStatus: "completed",
    req,
    action: "admin_complete",
    note,
    mutate: (doc) => {
      doc.checkoutAt = timestamp;
      if (note) {
        doc.addAdminNote({
          note: `[COMPLETED] ${note}`,
          userId: req.user?._id,
        });
      }
    },
  });

  await booking.populate([
    { path: "customerId", select: "name phone email username" },
    { path: "courtId", select: "name code type basePrice peakPrice images" },
    { path: "statusHistory.changedBy", select: "name username email role" },
    { path: "adminNotes.createdBy", select: "name username email role" },
  ]);

  return composeBookingDetail(booking, { includeAdminFields: true });
}

export async function adminAddNoteService(id, body, req) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const { note, pinned = false } = body || {};
  if (!note || !note.trim()) {
    throw {
      status: 400,
      message: "Nội dung ghi chú không được để trống",
    };
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  booking.addAdminNote({ note: note.trim(), userId: req.user?._id, pinned });
  await booking.save();

  await booking.populate([
    { path: "customerId", select: "name phone email username" },
    { path: "courtId", select: "name code type basePrice peakPrice images" },
    { path: "statusHistory.changedBy", select: "name username email role" },
    { path: "adminNotes.createdBy", select: "name username email role" },
  ]);

  return composeBookingDetail(booking, { includeAdminFields: true });
}

export async function updateBookingService(id, body) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const { error, value } = bookingValidation.update.validate(body, {
    abortEarly: false,
  });
  if (error) {
    throw {
      status: 400,
      message: "Dữ liệu không hợp lệ",
      errors: error.details.map((d) => d.message),
    };
  }

  const booking = await Booking.findByIdAndUpdate(id, value, {
    new: true,
    runValidators: true,
  })
    .populate("customerId", "username phone email")
    .populate("courtId", "name code type");

  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  return booking;
}

export async function deleteBookingService(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  await booking.deleteOne();
  return booking;
}

export async function checkinBookingService(body) {
  const { error, value } = bookingValidation.checkin.validate(body);
  if (error) {
    throw {
      status: 400,
      message: error.details[0].message,
    };
  }

  if (!mongoose.Types.ObjectId.isValid(value.bookingId)) {
    throw {
      status: 400,
      message: "ID không hợp lệ",
    };
  }

  const booking = await Booking.findById(value.bookingId);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  if (booking.status !== "confirmed") {
    throw {
      status: 400,
      message: "Chỉ có thể check-in khi booking đã được xác nhận",
    };
  }

  booking.status = "in_use";
  booking.checkinAt = value.checkinAt;
  await booking.save();

  return booking;
}

export async function checkoutBookingService(body) {
  const { error, value } = bookingValidation.checkout.validate(body);
  if (error) {
    throw {
      status: 400,
      message: error.details[0].message,
    };
  }

  const booking = await Booking.findById(value.bookingId);
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  if (booking.status !== "in_use") {
    throw {
      status: 400,
      message: "Chỉ có thể check-out khi đang in_use",
    };
  }

  booking.status = "completed";
  booking.checkoutAt = value.checkoutAt;
  await booking.save();

  return booking;
}

export async function cancelBookingService(id, body, user) {
  const booking = await Booking.findById(id)
    .populate("customerId", "name phone email")
    .populate("courtId", "name code type basePrice peakPrice images");
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  const isOwner = isBookingOwner(booking, user);
  const isAdmin = isAdminUser(user);
  if (!isOwner && !isAdmin) {
    throw {
      status: 403,
      message: "Bạn không có quyền huỷ đơn đặt sân này",
    };
  }

  if (
    ["completed", "cancelled", "no_show"].includes(booking.status) &&
    !isAdmin
  ) {
    throw {
      status: 400,
      message: "Không thể hủy booking đã hoàn tất hoặc đã hủy",
    };
  }

  if (!canCancelWithinWindow(booking, isAdmin)) {
    throw {
      status: 400,
      message: `Bạn chỉ có thể huỷ trước tối thiểu ${CANCEL_BEFORE_HOURS} giờ so với giờ bắt đầu`,
    };
  }

  // Lưu thông tin hoàn tiền nếu có
  if (body?.refundAccountNumber) {
    booking.refundAccountNumber = body.refundAccountNumber.toString().trim();
  }
  if (body?.refundAccountName) {
    booking.refundAccountName = body.refundAccountName.toString().trim();
  }
  if (body?.refundBankName) {
    booking.refundBankName = body.refundBankName.toString().trim();
  }
  if (body?.refundNote) {
    booking.refundNote = body.refundNote.toString().trim();
  }

  const reason = (body?.reason || "").toString().trim();
  if (reason) {
    booking.cancelReason = reason;
  } else if (!booking.cancelReason) {
    booking.cancelReason = "Khách hàng chủ động huỷ đơn.";
  }

  // Cập nhật payment status nếu đã thanh toán
  if (["paid", "partial"].includes(booking.paymentStatus)) {
    booking.paymentStatus = "refunded";
  }

  if (booking.depositStatus === "paid") {
    booking.depositStatus = "refunded";
  }

  // Sử dụng pushStatusChange để cập nhật status và statusHistory
  booking.$locals = booking.$locals || {};
  booking.$locals.actorId = user?._id ?? null;
  booking.$locals.statusAction = "cancel";
  booking.$locals.statusNote = reason || "Khách hàng chủ động huỷ đơn.";
  
  await pushStatusChange({
    booking,
    nextStatus: "cancelled",
    req: { user },
    action: "cancel",
    note: reason || "Khách hàng chủ động huỷ đơn.",
  });

  await booking.save();

  return composeBookingDetail(booking);
}

export async function updatePaymentStatusService(id, body) {
  const { paymentStatus } = body;
  if (!["unpaid", "partial", "paid", "refunded"].includes(paymentStatus)) {
    throw {
      status: 400,
      message: "Trạng thái thanh toán không hợp lệ",
    };
  }

  const booking = await Booking.findByIdAndUpdate(
    id,
    { paymentStatus },
    { new: true }
  );
  if (!booking) {
    throw {
      status: 404,
      message: "Không tìm thấy booking",
    };
  }

  return booking;
}

