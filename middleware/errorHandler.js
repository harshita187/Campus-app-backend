function errorHandler(err, req, res, next) {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      message: "Image is too large. Max allowed size is 15MB.",
    });
  }

  // Other upload problems (too many files, unexpected field name) are client errors too.
  if (err?.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }

  // A malformed id such as "abc" in /conversations/abc/messages is the client's
  // mistake, so answer 400 instead of 500.
  if (err?.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path || "id"}` });
  }

  // Mongoose schema validation failed (for example a chat message over 1000
  // characters). Name the fields, but never echo their values (they can be private).
  if (err?.name === "ValidationError") {
    const fields = Object.keys(err.errors || {});
    return res.status(400).json({ message: `Invalid ${fields.join(", ") || "input"}` });
  }

  if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // A unique index rejected a duplicate (E11000): a conflict, not a server bug.
  if (err?.code === 11000) {
    return res.status(409).json({ message: "This record already exists" });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message || "Request failed";
  const payload = { message };

  if (statusCode >= 500) {
    console.error(err);
  }

  // Stack traces reveal file paths and code details, so send them only when
  // NODE_ENV is explicitly "development", never by default.
  if (process.env.NODE_ENV === "development" && err.stack) {
    payload.stack = err.stack;
    payload.detail = err.message;
  }

  res.status(statusCode).json(payload);
}

module.exports = errorHandler;
