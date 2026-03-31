const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const asyncHandler = require("../utils/asyncHandler");
const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} = require("../validators/productValidators");
const {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const router = express.Router();

router.get("/", validate(listProductsQuerySchema, "query"), asyncHandler(listProducts));
router.get("/:id", asyncHandler(getProductById));
router.post("/", verifyToken, validate(createProductSchema), asyncHandler(createProduct));
router.put("/:id", verifyToken, validate(updateProductSchema), asyncHandler(updateProduct));
router.delete("/:id", verifyToken, asyncHandler(deleteProduct));

module.exports = router;
