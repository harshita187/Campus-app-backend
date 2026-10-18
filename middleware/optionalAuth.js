const ApiError = require("../utils/ApiError");
const { readAccessToken, verifyAccessToken } = require("../utils/authTokens");

/**
 * Attaches req.user when a valid, unrevoked access token is present.
 * Does not reject when the token is missing or invalid (req.user stays undefined).
 */
async function optionalAuth(req, res, next) {
  const token = readAccessToken(req);
  if (!token) {
    return next();
  }

  try {
    req.user = await verifyAccessToken(token);
  } catch (err) {
    // A bad or revoked token just means "not signed in". Anything else (for
    // example the database being down) is a real error and must not be hidden.
    if (err instanceof ApiError && err.statusCode === 401) {
      req.user = undefined;
    } else {
      return next(err);
    }
  }
  return next();
}

module.exports = optionalAuth;
