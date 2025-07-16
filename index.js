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

// Middleware
app.use(cors());
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

app.listen(PORT, () => {
  console.log(`🚀 Backend server is up and running on port ${PORT}!`);
});



