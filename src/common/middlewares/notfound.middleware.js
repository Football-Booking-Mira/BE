export const notFoundMiddleware = (req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: "ROUTE NOT FOUND",
  });
};
