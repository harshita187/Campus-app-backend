const Product = require("../models/Product");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const escapeRegex = require("../utils/escapeRegex");
const {
  getCollegeLabel,
  getNearbyCollegeIds,
  listCollegesPayload,
  normalizeCollegeId,
  isValidCollegeId,
} = require("../config/colleges");

/** Listings older than this are hidden from the public marketplace (still visible in “My listings”). */
const LISTING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const listingFreshCutoff = () => new Date(Date.now() - LISTING_MAX_AGE_MS);

function listingCampusLabel(doc) {
  if (!doc || typeof doc !== "object") return "";
  const n = typeof doc.campusName === "string" && doc.campusName.trim();
  if (n) return doc.campusName.trim();
  return getCollegeLabel(doc.collegeId);
}

const createProduct = async (req, res) => {
  const seller = await User.findById(req.user.id)
    .select("collegeId campusName role")
    .lean();
  if (seller?.role === "buyer") {
    throw new ApiError(
      403,
      "Buyer accounts cannot post listings. Sign up as Seller or Both to sell."
    );
  }
  const campusName = ((seller?.campusName || "").trim() || "Campus").slice(0, 120);
  const slugRaw = seller?.collegeId && String(seller.collegeId).trim();
  const collegeId =
    slugRaw && isValidCollegeId(slugRaw) ? slugRaw : normalizeCollegeId(slugRaw) || "";
  const product = await Product.create({
    ...req.body,
    sellerId: req.user.id,
    collegeId,
    campusName,
  });
  const populated = await product.populate(
    "sellerId",
    "name email collegeId campusName role"
  );
  const plain = populated.toObject ? populated.toObject() : populated;
  res.status(201).json({
    ...plain,
    collegeLabel: listingCampusLabel(plain),
    sellerId:
      plain.sellerId && typeof plain.sellerId === "object"
        ? {
            ...plain.sellerId,
            collegeLabel: listingCampusLabel(plain.sellerId),
          }
        : plain.sellerId,
  });
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
    college,
    collegeScope = "all",
    campusQ,
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

  if (!isMine) {
    const collegeSlug = typeof college === "string" && college.trim() ? college.trim() : "";
    const campusQueryRaw =
      typeof campusQ === "string" && campusQ.trim() ? campusQ.trim().slice(0, 80) : "";

    if (collegeSlug) {
      const official = getCollegeLabel(collegeSlug);
      const or = [{ collegeId: collegeSlug }];
      if (official) {
        or.push({ campusName: new RegExp(`^${escapeRegex(official)}$`, "i") });
      }
      filter.$or = or;
    } else if (
      campusQueryRaw &&
      collegeScope !== "my_college" &&
      collegeScope !== "nearby"
    ) {
      filter.campusName = new RegExp(escapeRegex(campusQueryRaw), "i");
    } else if (collegeScope === "my_college") {
      if (!req.user?.id) {
        throw new ApiError(401, "Sign in to filter by your campus");
      }
      const u = await User.findById(req.user.id).select("collegeId campusName").lean();
      const mineName = (u?.campusName || "").trim();
      if (mineName) {
        filter.campusName = new RegExp(`^${escapeRegex(mineName)}$`, "i");
      } else {
        const slug = normalizeCollegeId(u?.collegeId);
        if (!slug) {
          throw new ApiError(400, "Add your campus name on your account to use this filter");
        }
        filter.collegeId = slug;
      }
    } else if (collegeScope === "nearby") {
      if (!req.user?.id) {
        throw new ApiError(401, "Sign in to show listings from your campus and nearby");
      }
      const u = await User.findById(req.user.id).select("collegeId campusName").lean();
      const rawSlug = u?.collegeId && String(u.collegeId).trim();
      const mineSlug =
        rawSlug && isValidCollegeId(rawSlug) ? rawSlug : normalizeCollegeId(rawSlug);
      if (mineSlug) {
        const nearby = getNearbyCollegeIds(mineSlug);
        const ids = [mineSlug, ...nearby];
        const or = [{ collegeId: { $in: ids } }];
        for (const id of ids) {
          const lab = getCollegeLabel(id);
          if (lab) {
            or.push({ campusName: new RegExp(`^${escapeRegex(lab)}$`, "i") });
          }
        }
        filter.$or = or;
      } else {
        const mineName = (u?.campusName || "").trim();
        if (!mineName) {
          throw new ApiError(
            400,
            "Nearby filter works best with a known campus profile; set your campus name first"
          );
        }
        filter.campusName = new RegExp(`^${escapeRegex(mineName)}$`, "i");
      }
    }
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
      .populate("sellerId", "name email collegeId campusName role")
      .lean(),
    Product.countDocuments(filter),
  ]);

  const itemsOut = items.map((doc) => ({
    ...doc,
    collegeLabel: listingCampusLabel(doc),
    sellerId:
      doc.sellerId && typeof doc.sellerId === "object"
        ? {
            ...doc.sellerId,
            collegeLabel: listingCampusLabel(doc.sellerId),
          }
        : doc.sellerId,
  }));

  res.json({
    items: itemsOut,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  });
};

const getProductById = async (req, res) => {
  const item = await Product.findById(req.params.id).populate(
    "sellerId",
    "name email collegeId campusName role"
  );
  if (!item) throw new ApiError(404, "Product not found");
  const plain = item.toObject ? item.toObject() : item;
  const sid = plain.sellerId;
  res.json({
    ...plain,
    collegeLabel: listingCampusLabel(plain),
    sellerId:
      sid && typeof sid === "object"
        ? { ...sid, collegeLabel: listingCampusLabel(sid) }
        : sid,
  });
};

const UPDATE_FIELDS = new Set([
  "title",
  "description",
  "price",
  "category",
  "condition",
  "images",
  "pickupLocation",
  "negotiable",
  "urgency",
  "urgencyNote",
]);

const updateProduct = async (req, res) => {
  const item = await Product.findById(req.params.id);
  if (!item) throw new ApiError(404, "Product not found");
  if (String(item.sellerId) !== req.user.id) throw new ApiError(403, "Not authorized");

  const patch = {};
  for (const key of UPDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
    patch[key] = req.body[key];
  }
  if (patch.price !== undefined) {
    const n = Number(patch.price);
    if (Number.isNaN(n)) throw new ApiError(400, "Invalid price");
    patch.price = n;
  }
  Object.assign(item, patch);
  await item.save();
  const populated = await item.populate(
    "sellerId",
    "name email collegeId campusName role"
  );
  const plain = populated.toObject ? populated.toObject() : populated;
  res.json({
    ...plain,
    collegeLabel: listingCampusLabel(plain),
    sellerId:
      plain.sellerId && typeof plain.sellerId === "object"
        ? {
            ...plain.sellerId,
            collegeLabel: listingCampusLabel(plain.sellerId),
          }
        : plain.sellerId,
  });
};

const deleteProduct = async (req, res) => {
  const item = await Product.findById(req.params.id);
  if (!item) throw new ApiError(404, "Product not found");
  if (String(item.sellerId) !== req.user.id) throw new ApiError(403, "Not authorized");

  await item.deleteOne();
  res.json({ message: "Product deleted successfully" });
};

const listCollegesMeta = (_req, res) => {
  res.json(listCollegesPayload());
};

module.exports = {
  createProduct,
  getPublicStats,
  listProducts,
  listCollegesMeta,
  getProductById,
  updateProduct,
  deleteProduct,
};
