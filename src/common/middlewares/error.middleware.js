import createResponse from "../../utils/responses.js";

export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Lỗi Server";

  // Xử lý riêng cho lỗi trùng khóa MongoDB (E11000 duplicate key)
  // Ví dụ: trùng slot đặt sân (index: uq_exact_slot)
  // => Trả về thông báo rõ ràng: khung giờ/sân đã có người đặt hoặc đang được giữ chỗ
  if (err && err.code === 11000) {
    statusCode = 400;

    const rawMsg = err.message || "";
    const isSlotDuplicate =
      typeof rawMsg === "string" && rawMsg.includes("uq_exact_slot");

    if (isSlotDuplicate) {
      message =
        "Khung giờ và sân này đã có đơn đặt trước đó. Có thể trong lúc bạn thao tác, người khác đã hoàn tất đặt sân trước. Vui lòng chọn khung giờ khác hoặc kiểm tra lại trong mục Đơn của bạn.";
    } else {
      message =
        "Dữ liệu bạn đang nhập đã tồn tại. Vui lòng kiểm tra lại thông tin trước khi gửi.";
    }
  }

  res.status(statusCode).json(createResponse(null, statusCode, message, null));
};
