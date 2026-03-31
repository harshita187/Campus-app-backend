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

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

mongoose
  .connect(env.mongoUri)
  .then(async () => {
    console.log("MongoDB connected");
    await cleanupStaleIndexes();
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
});
