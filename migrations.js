const mongoose = require("mongoose");
const toCampusKey = require("./utils/campusKey");

/**
 * Data fixes that run once per server start, before the server accepts requests.
 * Each step only touches documents that still need it, so running twice is safe.
 */

/** Product indexes from before the campusKey / _id tie-breaker change. */
const OLD_PRODUCT_INDEXES = [
  "status_1_createdAt_-1",
  "status_1_category_1_createdAt_-1",
  "status_1_collegeId_1_createdAt_-1",
  "status_1_campusName_1_createdAt_-1",
];

const cleanupStaleIndexes = async () => {
  try {
    const usersCollection = mongoose.connection.collection("users");
    const indexes = await usersCollection.indexes();
    const hasLegacyPhoneNumberIndex = indexes.some(
      (idx) => idx.name === "phoneNumber_1"
    );

    if (hasLegacyPhoneNumberIndex) {
      await usersCollection.dropIndex("phoneNumber_1");
      console.log("Dropped legacy index: phoneNumber_1");
    }
  } catch (error) {
    console.warn("Index cleanup skipped:", error.message);
  }
};

/**
 * Builds the current Product indexes first, then drops the old ones they
 * replace. Every index slows down writes and uses memory, so unused ones go.
 */
const replaceOldProductIndexes = async () => {
  const Product = require("./models/Product");
  await Product.init();
  const existing = (await Product.collection.indexes()).map((idx) => idx.name);
  for (const name of OLD_PRODUCT_INDEXES) {
    if (!existing.includes(name)) continue;
    await Product.collection.dropIndex(name);
    console.log(`Dropped old product index: ${name}`);
  }
};

const migrateUserProductCampusAndRoles = async () => {
  const User = require("./models/User");
  const Product = require("./models/Product");
  const {
    getCollegeLabel,
    DEFAULT_COLLEGE_ID,
    isValidCollegeId,
  } = require("./config/colleges");

  const roleRes = await User.updateMany(
    { role: { $exists: false } },
    { $set: { role: "both" } }
  );
  if (roleRes.modifiedCount) {
    console.log(`Backfilled user.role: ${roleRes.modifiedCount}`);
  }

  const usersNeedCampus = await User.find({
    $or: [{ campusName: { $exists: false } }, { campusName: null }, { campusName: "" }],
  })
    .select("collegeId")
    .lean();

  let userCampusWrites = 0;
  for (const u of usersNeedCampus) {
    const slug =
      u.collegeId && String(u.collegeId).trim() && isValidCollegeId(u.collegeId)
        ? u.collegeId.trim()
        : DEFAULT_COLLEGE_ID;
    const campusName = getCollegeLabel(slug) || "Campus";
    const set = { campusName };
    if (!u.collegeId || !String(u.collegeId).trim()) {
      set.collegeId = slug;
    }
    await User.updateOne({ _id: u._id }, { $set: set });
    userCampusWrites += 1;
  }
  if (userCampusWrites) {
    console.log(`Backfilled user.campusName: ${userCampusWrites}`);
  }

  const productsNeedCampus = await Product.find({
    $or: [{ campusName: { $exists: false } }, { campusName: null }, { campusName: "" }],
  })
    .select("sellerId collegeId")
    .lean();

  let productCampusWrites = 0;
  for (const p of productsNeedCampus) {
    let campusName = "";
    if (p.sellerId) {
      const seller = await User.findById(p.sellerId).select("campusName").lean();
      campusName = (seller?.campusName && seller.campusName.trim()) || "";
    }
    if (!campusName) {
      campusName = getCollegeLabel(p.collegeId) || "Campus";
    }
    await Product.updateOne(
      { _id: p._id },
      { $set: { campusName, campusKey: toCampusKey(campusName) } },
      { timestamps: false }
    );
    productCampusWrites += 1;
  }
  if (productCampusWrites) {
    console.log(`Backfilled product.campusName: ${productCampusWrites}`);
  }
};

/** Listings created before `campusKey` existed get it computed from `campusName`. */
const backfillProductCampusKeys = async () => {
  const Product = require("./models/Product");
  const missing = await Product.find({ campusKey: { $exists: false } })
    .select("campusName")
    .lean();
  if (!missing.length) return;

  await Product.bulkWrite(
    missing.map((p) => ({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { campusKey: toCampusKey(p.campusName) } },
        // A data fix is not a user edit, so keep each listing's updatedAt.
        timestamps: false,
      },
    }))
  );
  console.log(`Backfilled product.campusKey: ${missing.length}`);
};

async function runStartupMigrations() {
  await cleanupStaleIndexes();
  await migrateUserProductCampusAndRoles();
  await backfillProductCampusKeys();
  await replaceOldProductIndexes();
}

module.exports = { runStartupMigrations };
