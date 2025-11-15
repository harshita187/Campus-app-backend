const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables from .env
dotenv.config();

// DEBUG: Check if MONGO_URI is loaded
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is undefined! Check your .env file.");
  process.exit(1); // Stop the server if URI is missing
} else {
  console.log("✅ MONGO_URI loaded:", process.env.MONGO_URI);
}

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.1.9:3000",
      /^http:\/\/192\.168\.\d+\.\d+:3000$/,
      /^http:\/\/10\.\d+\.\d+\.\d+:3000$/,
    ];

    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") {
        return origin === allowed;
      }
      return allowed.test(origin);
    });

    callback(null, isAllowed);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully!"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Sample Route
app.get("/", (req, res) => {
  res.send("🌐 Campus App Backend is alive!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server is up and running on port ${PORT}!`);
  console.log(
    `🌐 Accessible at: http://localhost:${PORT} or http://0.0.0.0:${PORT}`
  );
});
