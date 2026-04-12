const jwt = require("jsonwebtoken");
const env = require("../config/env");

/**
 * Attaches req.user when a valid Bearer / cookie token is present.
 * Does not reject when missing or invalid (req.user stays undefined).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const token = bearerToken || req.cookies?.accessToken;

  if (!token) {
    return next();
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
  } catch {
    req.user = undefined;
  }
  next();
}

module.exports = optionalAuth;
