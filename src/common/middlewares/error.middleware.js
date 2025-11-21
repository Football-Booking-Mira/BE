import createResponse from "../../utils/responses.js";

export const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Lỗi Server";

  // Log error for debugging
  console.error("❌ Error Middleware:", {
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { error: err.stack }),
  });
};
