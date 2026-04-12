const Product = require("../models/Product");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

/** Listings older than this are hidden from the public marketplace (still visible in “My listings”). */
const LISTING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const listingFreshCutoff = () => new Date(Date.now() - LISTING_MAX_AGE_MS);

const createProduct = async (req, res) => {
  const product = await Product.create({ ...req.body, sellerId: req.user.id });
  const populated = await product.populate("sellerId", "name email");
  res.status(201).json(populated);
};

const pctChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const getPublicStats = async (req, res) => {
  const now = new Date();
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const dayBuckets = [];
  for (let i = 6; i >= 0; i -= 1) {
    const start = startOfDay(now);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dayBuckets.push({ start, end });
  }

  const dailyCounts = await Promise.all(
    dayBuckets.map(({ start, end }) =>
      Promise.all([
        User.countDocuments({ createdAt: { $gte: start, $lt: end } }),
        Product.countDocuments({ status: "active", createdAt: { $gte: start, $lt: end } }),
      ])
    )
  );

  const usersByDay = dailyCounts.map(([u]) => u);
  const listingsByDay = dailyCounts.map(([, p]) => p);

  const listingFresh = { status: "active", createdAt: { $gte: listingFreshCutoff() } };

  const [
    categoryAggregation,
    users,
    listings,
    usersThisWeek,
    usersPrevWeek,
    listingsThisWeek,
    listingsPrevWeek,
    recentUsers,
  ] = await Promise.all([
    Product.aggregate([
      { $match: listingFresh },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
    User.countDocuments(),
    Product.countDocuments(listingFresh),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    User.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
    Product.countDocuments({ ...listingFresh, createdAt: { $gte: weekAgo } }),
    Product.countDocuments({
      status: "active",
      createdAt: { $gte: twoWeeksAgo, $lt: weekAgo },
    }),
    User.find().sort({ createdAt: -1 }).limit(8).select("name").lean(),
  ]);

  const categoryCounts = {};
  for (const row of categoryAggregation) {
    if (row._id) categoryCounts[row._id] = row.count;
  }

  res.json({
    users,
    activeListings: listings,
    categoryCounts,
    recentUsers: recentUsers.map((u) => ({ name: u.name || "Student" })),
    deltas: {
      usersWeekPct: pctChange(usersThisWeek, usersPrevWeek),
      listingsWeekPct: pctChange(listingsThisWeek, listingsPrevWeek),
    },
    sparklines: {
      users: usersByDay,
      listings: listingsByDay,
    },
  });
};

const listProducts = async (req, res) => {
  const {
    q = "",
    category,
    condition,
    sort = "newest",
    page = 1,
    limit = 12,
    mine,
    minPrice,
    maxPrice,
    urgency,
  } = req.query;

  const filter = { status: "active" };
  const isMine = mine === "true" || mine === "1";
  if (isMine) {
    if (!req.user?.id) {
      throw new ApiError(401, "Sign in to view your listings");
    }
    filter.sellerId = req.user.id;
  } else {
    filter.createdAt = { $gte: listingFreshCutoff() };
  }
  if (category) filter.category = category;
  if (condition) filter.condition = condition;
  if (q) filter.$text = { $search: q };
  if (urgency === "moving_out" || urgency === "flash_sale") {
    filter.urgency = urgency;
  }

  const priceBounds = {};
  if (minPrice !== undefined && minPrice !== "") {
    const n = Number(minPrice);
    if (!Number.isNaN(n) && n >= 0) priceBounds.$gte = n;
  }
  if (maxPrice !== undefined && maxPrice !== "") {
    const n = Number(maxPrice);
    if (!Number.isNaN(n) && n >= 0) priceBounds.$lte = n;
  }
  if (Object.keys(priceBounds).length) filter.price = priceBounds;

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
  getPublicStats,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
