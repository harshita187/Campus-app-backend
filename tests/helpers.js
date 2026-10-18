/**
 * Shared setup for API tests.
 * Each test file starts its own in-memory MongoDB (mongodb-memory-server),
 * so tests never touch a real database and can run in CI.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-secret";
// config/env.js requires MONGO_URI to exist. Tests connect to the in-memory server instead.
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:1/unused";
// Uploaded test files go to a temporary folder, never into the project.
process.env.UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "campus-uploads-"));

const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

async function startTestServer() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const createApp = require("../app");
  const { app } = createApp();
  // Wait until every declared index exists. Unique indexes matter for the race tests.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return app;
}

async function stopTestServer() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

let userCounter = 0;

/** Signs up a new user, logs in, and returns the access token, user and cookies. */
async function signupAndLogin(app, overrides = {}) {
  userCounter += 1;
  const user = {
    name: "Test User",
    email: `user${userCounter}@college.edu`,
    password: "Password123",
    phone: "9999999999",
    campusName: "MNIT Jaipur",
    role: "both",
    ...overrides,
  };
  await request(app).post("/api/auth/signup").send(user).expect(201);
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password: user.password })
    .expect(200);
  return { token: res.body.token, user: res.body.user, cookies: res.headers["set-cookie"] };
}

/** Reads one cookie's value (for example "refreshToken") from a Set-Cookie header list. */
function cookieValue(setCookieHeaders, name) {
  const row = (setCookieHeaders || []).find((c) => c.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.split(";")[0].slice(name.length + 1)) : null;
}

async function createProduct(app, token, overrides = {}) {
  const body = {
    title: "Study table",
    description: "Wooden study table in good condition",
    price: 1200,
    category: "Furniture",
    condition: "Good",
    images: ["https://example.com/table.jpg"],
    ...overrides,
  };
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send(body)
    .expect(201);
  return res.body;
}

/** Collects every "stage" name in a MongoDB explain() plan (works for old and new plan formats). */
function planStages(plan, stages = []) {
  if (Array.isArray(plan)) {
    plan.forEach((p) => planStages(p, stages));
  } else if (plan && typeof plan === "object") {
    if (typeof plan.stage === "string") stages.push(plan.stage);
    Object.values(plan).forEach((v) => planStages(v, stages));
  }
  return stages;
}

module.exports = {
  startTestServer,
  stopTestServer,
  clearDatabase,
  signupAndLogin,
  cookieValue,
  createProduct,
  planStages,
};
