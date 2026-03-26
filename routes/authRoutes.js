const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const asyncHandler = require("../utils/asyncHandler");
const { signupSchema, loginSchema } = require("../validators/authValidators");
const {
  signup,
  login,
  me,
  refresh,
  logout,
  logoutAll,
} = require("../controllers/authController");

const router = express.Router();

router.post("/signup", validate(signupSchema), asyncHandler(signup));
router.post("/login", validate(loginSchema), asyncHandler(login));
router.post("/refresh", asyncHandler(refresh));
router.post("/logout", asyncHandler(logout));
router.post("/logout-all", verifyToken, asyncHandler(logoutAll));
router.get("/me", verifyToken, asyncHandler(me));

module.exports = router;
