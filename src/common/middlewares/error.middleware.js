import createResponse from "../../utils/responses.js";

export const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Lỗi Server";

  res.status(statusCode).json(createResponse(statusCode, message));
};
