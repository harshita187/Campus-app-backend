const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/User");
const ApiError = require("./ApiError");

/** Reads the access token from "Authorization: Bearer <token>" or the accessToken cookie. */
function readAccessToken(req) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  return bearerToken || req.cookies?.accessToken || null;
}

/**
 * Checks an access token and returns its payload ({ id, tokenVersion, ... }).
 *
 * 1. The signature and expiry must be valid.
 * 2. It must not be a refresh token. Refresh tokens live 7 days and are signed
 *    with the same secret, so without this check they would work as access tokens.
 * 3. Its tokenVersion must equal the user's current refreshTokenVersion.
 *    "Log out of all devices" increases that number, so every older token stops
 *    working at once instead of staying valid until it expires (up to 15 minutes).
 *
 * Cost: one read of the user by _id (the primary-key index) per request.
 */
async function verifyAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  if (payload.type === "refresh") {
    throw new ApiError(401, "Invalid token type");
  }
  if (!mongoose.Types.ObjectId.isValid(payload.id)) {
    throw new ApiError(401, "Invalid or expired token");
  }

  await assertSessionStillValid(payload);
  return payload;
}

/**
 * Checks the refresh token from the cookie. Any problem (missing, garbage,
 * expired, an access token sent instead, a revoked session) is a 401, never a 500.
 * Returns the user document so the caller can sign a new access token.
 */
async function verifyRefreshToken(token) {
  if (!token) throw new ApiError(401, "No refresh token provided");
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
  if (payload.type !== "refresh" || !mongoose.Types.ObjectId.isValid(payload.id)) {
    throw new ApiError(401, "Invalid refresh token");
  }
  return assertSessionStillValid(payload);
}

/** The token's version must match the user's current one ("log out of all devices" bumps it). */
async function assertSessionStillValid(payload) {
  // Read only the two fields we need (_id is always included), never the password hash.
  const user = await User.findById(payload.id).select("refreshTokenVersion").lean();
  if (!user || (user.refreshTokenVersion ?? 0) !== (payload.tokenVersion ?? 0)) {
    throw new ApiError(401, "Session has ended. Please sign in again.");
  }
  return user;
}

module.exports = { readAccessToken, verifyAccessToken, verifyRefreshToken };
