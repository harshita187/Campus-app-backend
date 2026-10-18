const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const required = ["MONGO_URI", "JWT_SECRET"];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5001),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  clientUrls: (process.env.CLIENT_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  /**
   * Number of proxies in front of the app. Cloud Run's front end is 1 hop, so
   * req.ip becomes the real client address (needed for per-client rate limits).
   * Never use `true`: then any client could pick its own IP via X-Forwarded-For.
   */
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads"),
};
