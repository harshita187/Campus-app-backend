const env = require("./env");

const staticOrigins = [
  env.clientUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const dynamicOrigins = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
];

module.exports = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const exact = staticOrigins.includes(origin);
    const regex = dynamicOrigins.some((pattern) => pattern.test(origin));
    return callback(null, exact || regex);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
