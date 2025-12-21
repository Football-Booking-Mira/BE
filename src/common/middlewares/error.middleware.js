import createResponse from "../../utils/responses.js";

export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Lỗi Server";

  // Xử lý lỗi duplicate key MongoDB (E11000)
  if (err && err.code === 11000) {
    statusCode = 400;

    const rawMsg = err.message || "";
    // Kiểm tra xem lỗi trùng slot đặt sân
    const isSlotDuplicate =
      typeof rawMsg === "string" && rawMsg.includes("uq_exact_slot");

    if (isSlotDuplicate) {
      // Có thể parse thêm slot + sân từ message để cụ thể hơn
      const slotMatch = rawMsg.match(/index: uq_exact_slot.*\sdup key.*\{ : "(.*)" \}/);
      const slotInfo = slotMatch ? slotMatch[1] : "khung giờ và sân này";
      message = `Đơn đặt ${slotInfo} đã tồn tại. Vui lòng chọn khung giờ khác hoặc kiểm tra lại trong mục Đơn của bạn.`;
    } else {
      // Các duplicate khác, ví dụ email, username...
      const keyMatch = rawMsg.match(/index: (.*)_1 dup key/);
      const keyName = keyMatch ? keyMatch[1] : "dữ liệu";
      message = `${keyName} đã tồn tại. Vui lòng kiểm tra lại thông tin trước khi gửi.`;
    }
  }

  res.status(statusCode).json(createResponse(null, statusCode, message, null));
};
