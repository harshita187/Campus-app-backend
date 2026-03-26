const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const upload = require("../middleware/upload");
const asyncHandler = require("../utils/asyncHandler");
const { uploadImage } = require("../controllers/uploadController");

const router = express.Router();

router.post("/images", verifyToken, upload.single("image"), asyncHandler(uploadImage));

module.exports = router;
