import createResponse from "../../utils/responses.js";
import { NODE_ENV } from "../config/environment.js";

export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.";

  // Log error on server for debugging
  console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}:`, err);

  // Handle MongoDB E11000 duplicate key errors
  if (err && err.code === 11000) {
    statusCode = 400;
    const rawMsg = err.message || "";
    const isSlotDuplicate =
      typeof rawMsg === "string" && rawMsg.includes("uq_exact_slot");

    if (isSlotDuplicate) {
      message =
        "Khung giờ và sân này đã có đơn đặt trước đó. Vui lòng chọn khung giờ khác.";
    } else {
      message =
        "Dữ liệu bạn đang nhập đã tồn tại. Vui lòng kiểm tra lại thông tin trước khi gửi.";
    }
  }

  // Hide internal stack traces and raw 500 database error details in production
  if (NODE_ENV === "production" && statusCode === 500) {
    message = "Đã xảy ra lỗi hệ thống trên máy chủ. Vui lòng liên hệ hỗ trợ.";
  }

  res.status(statusCode).json(createResponse(false, statusCode, message, null));
};
