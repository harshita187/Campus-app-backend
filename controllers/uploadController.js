const path = require("path");

const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Image file is required" });
  }

  const relativePath = `/uploads/${req.file.filename}`;
  const fullUrl = `${req.protocol}://${req.get("host")}${relativePath}`;

  return res.status(201).json({
    // Prefer path-only so the client always resolves with its current API origin (avoids host mismatches).
    url: relativePath,
    fullUrl,
    filename: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
    ext: path.extname(req.file.originalname),
  });
};

module.exports = { uploadImage };
