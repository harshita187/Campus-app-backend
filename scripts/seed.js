#!/usr/bin/env node
/**
 * Local demo data: one seller user + sample listings.
 * Run from backend root: npm run seed
 *
 * Idempotent: re-run removes previous products for this seed user only, then re-inserts samples.
 * Login in the app with SEED_USER.email / SEED_USER.password (after seed).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Product = require("../models/Product");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing MONGO_URI. Add it to Campus-app-backend/.env");
  process.exit(1);
}

const SEED_USER = {
  name: "Campus Demo Seller",
  email: "demo.seller@campusmarket.local",
  password: "Demo123456",
  phone: "9876543210",
};

/** Stable placeholder images (picsum; avoids hotlink / referrer issues). */
const SAMPLE_PRODUCTS = [
  {
    title: "Engineering notes bundle",
    description: "Printed semester bundle with solved problems and last-year questions for quick revision.",
    price: 450,
    category: "Notes",
    condition: "Good",
    images: ["https://picsum.photos/seed/campus-notes/640/480"],
    pickupLocation: "Library pickup",
    negotiable: true,
    urgency: "none",
  },
  {
    title: "Hybrid city cycle 21-speed",
    description: "Light daily rider with lock and bottle cage. Recently serviced brakes and gears.",
    price: 6800,
    category: "Cycle",
    condition: "Like New",
    images: ["https://picsum.photos/seed/campus-cycle/640/480"],
    pickupLocation: "Main gate",
    negotiable: true,
    urgency: "moving_out",
  },
  {
    title: "Scientific calculator TI-36X",
    description: "Allowed in exams on campus. Battery fresh, no scratches on screen.",
    price: 890,
    category: "Electronics",
    condition: "Excellent",
    images: ["https://picsum.photos/seed/campus-calc/640/480"],
    pickupLocation: "Academic block",
    negotiable: false,
    urgency: "none",
  },
  {
    title: "Desk lamp LED adjustable",
    description: "Warm and cool modes for hostel desk. Compact base, stable clamp optional.",
    price: 650,
    category: "Furniture",
    condition: "Good",
    images: ["https://picsum.photos/seed/campus-lamp/640/480"],
    pickupLocation: "Hostel 7",
    negotiable: true,
    urgency: "flash_sale",
  },
  {
    title: "Formal blazer navy size M",
    description: "Worn twice for interviews. Dry-cleaned and ready to wear for placements.",
    price: 2100,
    category: "Dress",
    condition: "Like New",
    images: ["https://picsum.photos/seed/campus-blazer/640/480"],
    pickupLocation: "Food court",
    negotiable: true,
    urgency: "none",
  },
  {
    title: "Mini cooler 20L hostel",
    description: "Runs quiet for single room. Selling before hostel shift—works perfectly.",
    price: 4500,
    category: "Cooler",
    condition: "Good",
    images: ["https://picsum.photos/seed/campus-cooler/640/480"],
    pickupLocation: "Hostel 4",
    negotiable: true,
    urgency: "moving_out",
  },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const email = SEED_USER.email.toLowerCase().trim();
  let user = await User.findOne({ email });

  if (!user) {
    const hashedPassword = await bcrypt.hash(SEED_USER.password, 10);
    user = await User.create({
      name: SEED_USER.name,
      email,
      password: hashedPassword,
      phone: SEED_USER.phone,
    });
    console.log("Created seed user:", email);
  } else {
    console.log("Seed user already exists:", email);
  }

  const deleted = await Product.deleteMany({ sellerId: user._id });
  if (deleted.deletedCount > 0) {
    console.log(`Removed ${deleted.deletedCount} old listing(s) for this seed user`);
  }

  const docs = SAMPLE_PRODUCTS.map((p) => ({
    ...p,
    sellerId: user._id,
    status: "active",
    urgencyNote: "",
  }));

  await Product.insertMany(docs);
  console.log(`Inserted ${docs.length} sample product(s)`);

  console.log("\n--- Demo login (use in Campus Market app) ---");
  console.log("Email:   ", email);
  console.log("Password:", SEED_USER.password);
  console.log("---\n");

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
