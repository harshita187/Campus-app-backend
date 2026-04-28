const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const optionalAuth = require("../middleware/optionalAuth");
const validate = require("../middleware/validate");
const asyncHandler = require("../utils/asyncHandler");
const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} = require("../validators/productValidators");
const {
  createProduct,
  getPublicStats,
  listProducts,
  listCollegesMeta,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const router = express.Router();

router.get(
  "/",
  optionalAuth,
  validate(listProductsQuerySchema, "query"),
  asyncHandler(listProducts)
);
router.get("/stats/summary", asyncHandler(getPublicStats));
router.get("/meta/colleges", asyncHandler(listCollegesMeta));
router.get("/:id", asyncHandler(getProductById));
router.post("/", verifyToken, validate(createProductSchema), asyncHandler(createProduct));
router.put("/:id", verifyToken, validate(updateProductSchema), asyncHandler(updateProduct));
router.delete("/:id", verifyToken, asyncHandler(deleteProduct));

module.exports = router;
