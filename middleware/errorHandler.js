function errorHandler(err, req, res, next) {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      message: "Image is too large. Max allowed size is 15MB.",
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";
  const payload = { message };

  if (process.env.NODE_ENV !== "production" && err.stack) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
}

module.exports = errorHandler;
