const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
  const token = bearerToken || req.cookies?.accessToken;

  if (!token) {
    return next(new ApiError(401, "Access denied. No token provided."));
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    req.user = decoded;
    return next();
  } catch (err) {
    return next(new ApiError(401, "Invalid or expired token"));
  }
}

module.exports = verifyToken;
