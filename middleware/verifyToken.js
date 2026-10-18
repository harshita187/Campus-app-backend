const ApiError = require("../utils/ApiError");
const { readAccessToken, verifyAccessToken } = require("../utils/authTokens");

/** Blocks the request with 401 unless it carries a valid, unrevoked access token. */
async function verifyToken(req, res, next) {
  const token = readAccessToken(req);
  if (!token) {
    return next(new ApiError(401, "Access denied. No token provided."));
  }

  try {
    req.user = await verifyAccessToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = verifyToken;
