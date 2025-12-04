const handleAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    // Giữ nguyên error gốc (bao gồm code 11000, statusCode, message...)
    // để errorMiddleware xử lý chi tiết (ví dụ: trùng slot đặt sân)
    next(error);
  });
};

export default handleAsync;
