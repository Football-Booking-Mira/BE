import { ensureAdmin, isBookingOwner, isAdminUser } from "./booking.utils.js";
import {
  createBookingService,
  getAllBookingsService,
  getMyBookingsService,
  getBookingByIdService,
  getAdminBookingDetailService,
  adminConfirmBookingService,
  adminCancelBookingService,
  adminCheckinBookingService,
  adminCompleteBookingService,
  adminAddNoteService,
  updateBookingService,
  deleteBookingService,
  checkinBookingService,
  checkoutBookingService,
  cancelBookingService,
  updatePaymentStatusService,
} from "./booking.service.js";

// ==================== User Routes ====================

export const createBooking = async (req, res) => {
  try {
    const booking = await createBookingService(req);
    return res.status(201).json({
      message: "Đặt sân thành công",
      data: booking,
    });
  } catch (err) {
    console.error("Error creating booking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.errors && { errors: err.errors }),
      ...(err.error && { error: err.error }),
    });
  }
};

export const getMyBookings = async (req, res) => {
  try {
    const result = await getMyBookingsService(req);
    return res.json(result);
  } catch (err) {
    console.error("Error fetching my bookings:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const data = await getBookingByIdService(req.params.id, req.user);
    return res.status(200).json({
      message: "Lấy chi tiết booking thành công",
      data,
    });
  } catch (err) {
    console.error("Error getBookingById:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const data = await cancelBookingService(
      req.params.id,
      req.body,
      req.user
    );
    return res.json({
      message: "Đã hủy booking",
      data,
    });
  } catch (err) {
    console.error("Error cancelBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

// ==================== Admin Routes ====================

export const getAllBookings = async (req, res) => {
  try {
    const result = await getAllBookingsService(req.query);
    return res.json(result);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const getAdminBookingDetail = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const data = await getAdminBookingDetailService(req.params.id);
    return res.status(200).json({
      message: "Lấy chi tiết booking admin thành công",
      data,
    });
  } catch (err) {
    console.error("Error getAdminBookingDetail:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const adminConfirmBooking = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const data = await adminConfirmBookingService(
      req.params.id,
      req.body,
      req
    );
    return res.status(200).json({
      message: "Đã xác nhận booking",
      data,
    });
  } catch (err) {
    console.error("Error adminConfirmBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const adminCancelBooking = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const data = await adminCancelBookingService(
      req.params.id,
      req.body,
      req
    );
    return res.status(200).json({
      message: "Đã hủy booking",
      data,
    });
  } catch (err) {
    console.error("Error adminCancelBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const adminCheckinBooking = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const data = await adminCheckinBookingService(
      req.params.id,
      req.body,
      req
    );
    return res.status(200).json({
      message: "Đã check-in booking",
      data,
    });
  } catch (err) {
    console.error("Error adminCheckinBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const adminCompleteBooking = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const data = await adminCompleteBookingService(
      req.params.id,
      req.body,
      req
    );
    return res.status(200).json({
      message: "Đã hoàn thành booking",
      data,
    });
  } catch (err) {
    console.error("Error adminCompleteBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const adminAddNote = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const data = await adminAddNoteService(req.params.id, req.body, req);
    return res.status(200).json({
      message: "Đã thêm ghi chú admin",
      data,
    });
  } catch (err) {
    console.error("Error adminAddNote:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const booking = await updateBookingService(req.params.id, req.body);
    return res.status(200).json({
      message: "Cập nhật thành công",
      data: booking,
    });
  } catch (err) {
    console.error("Error updateBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.errors && { errors: err.errors }),
      ...(err.error && { error: err.error }),
    });
  }
};

export const deleteBooking = async (req, res) => {
  try {
    const booking = await deleteBookingService(req.params.id);
    return res.status(200).json({
      message: "Xóa booking thành công",
      data: booking,
    });
  } catch (err) {
    console.error("Error deleteBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const checkinBooking = async (req, res) => {
  try {
    const booking = await checkinBookingService(req.body);
    return res.json({
      message: "Check-in thành công",
      data: booking,
    });
  } catch (err) {
    console.error("Error checkinBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const checkoutBooking = async (req, res) => {
  try {
    const booking = await checkoutBookingService(req.body);
    return res.json({
      message: "Check-out thành công",
      data: booking,
    });
  } catch (err) {
    console.error("Error checkoutBooking:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const booking = await updatePaymentStatusService(
      req.params.id,
      req.body
    );
    return res.json({
      message: "Cập nhật trạng thái thanh toán thành công",
      data: booking,
    });
  } catch (err) {
    console.error("Error updatePaymentStatus:", err);
    const status = err.status || 500;
    const message = err.message || "Lỗi server";
    return res.status(status).json({
      message,
      ...(err.error && { error: err.error }),
    });
  }
};
