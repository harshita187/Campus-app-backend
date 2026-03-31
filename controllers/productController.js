const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");

const createProduct = async (req, res) => {
  const product = await Product.create({ ...req.body, sellerId: req.user.id });
  const populated = await product.populate("sellerId", "name email");
  res.status(201).json(populated);
};

const listProducts = async (req, res) => {
  const {
    q = "",
    category,
    condition,
    sort = "newest",
    page = 1,
    limit = 12,
  } = req.query;

  const filter = { status: "active" };
  if (category) filter.category = category;
  if (condition) filter.condition = condition;
  if (q) filter.$text = { $search: q };

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    "price-low": { price: 1 },
    "price-high": { price: -1 },
  };

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(limitNum)
      .populate("sellerId", "name email")
      .lean(),
    Product.countDocuments(filter),
  ]);

  res.json({
    items,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  });
};

const getProductById = async (req, res) => {
  const item = await Product.findById(req.params.id).populate("sellerId", "name email");
  if (!item) throw new ApiError(404, "Product not found");
  res.json(item);
};

const updateProduct = async (req, res) => {
  const item = await Product.findById(req.params.id);
  if (!item) throw new ApiError(404, "Product not found");
  if (String(item.sellerId) !== req.user.id) throw new ApiError(403, "Not authorized");

  Object.assign(item, req.body);
  await item.save();
  const populated = await item.populate("sellerId", "name email");
  res.json(populated);
};

const deleteProduct = async (req, res) => {
  const item = await Product.findById(req.params.id);
  if (!item) throw new ApiError(404, "Product not found");
  if (String(item.sellerId) !== req.user.id) throw new ApiError(403, "Not authorized");

  await item.deleteOne();
  res.json({ message: "Product deleted successfully" });
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
