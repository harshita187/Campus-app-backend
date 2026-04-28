const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const env = require("./config/env");
const corsOptions = require("./config/cors");
const errorHandler = require("./middleware/errorHandler");
const registerChatSocket = require("./sockets/chatSocket");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    credentials: true,
  },
});
registerChatSocket(io);
app.set("io", io);

// Allow marketplace images on :3000 to load files served from this API (:5001).
// Helmet's default CORP is "same-origin", which blocks cross-origin <img> usage.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const chatRoutes = require("./routes/chatRoutes");
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/uploads", uploadRoutes);
/** Some hosts (e.g. Cloud Run behind path rewrites) call POST /uploads/images without /api. */
app.use("/uploads", uploadRoutes);
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders(res) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);
app.use("/api/chat", chatRoutes);

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
    await Product.updateOne({ _id: p._id }, { $set: { campusName } });
    productCampusWrites += 1;
  }
  if (productCampusWrites) {
    console.log(`Backfilled product.campusName: ${productCampusWrites}`);
  }
};

mongoose
  .connect(env.mongoUri)
  .then(async () => {
    console.log("MongoDB connected");
    await cleanupStaleIndexes();
    await migrateUserProductCampusAndRoles();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

app.get("/", (req, res) => {
  res.json({ message: "Campus App Backend is alive" });
});

app.use(errorHandler);

server.listen(env.port, "0.0.0.0", () => {
  console.log(`Backend server running on port ${env.port}`);
  console.log("Press Ctrl+C in this terminal to stop (not the arrow keys).");
});

function shutdown(signal) {
  console.log(`\n${signal} received — closing server…`);
  io.disconnectSockets(true);
  server.close(async () => {
    try {
      await mongoose.connection.close();
    } catch (_e) {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
