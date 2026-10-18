const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const uploadsDir = env.uploadDir;
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * The only file types we accept, and the extension we save each one with.
 * SVG is left out on purpose: it is XML that can contain scripts.
 */
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    // Never reuse the client's file name or extension. A file named x.html
    // that claims to be image/png is saved as <random>.png, so the server
    // always serves it as an image, never as a web page or a script.
    cb(null, `${crypto.randomUUID()}${ALLOWED_IMAGE_TYPES[file.mimetype]}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
    return cb(new ApiError(400, "Only JPEG, PNG, WebP or GIF images are allowed"));
  }
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Allow higher-quality marketplace photos without frequent client-side compression.
    fileSize: 15 * 1024 * 1024,
    files: 1,
  },
});

module.exports = upload;
