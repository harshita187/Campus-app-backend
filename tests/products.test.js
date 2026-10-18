const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const {
  startTestServer,
  stopTestServer,
  clearDatabase,
  signupAndLogin,
  createProduct,
} = require("./helpers");
const Product = require("../models/Product");
const toCampusKey = require("../utils/campusKey");
const { runStartupMigrations } = require("../migrations");

let app;
before(async () => {
  app = await startTestServer();
});
after(stopTestServer);
beforeEach(clearDatabase);

/**
 * Inserts listings straight into MongoDB with chosen createdAt values.
 * Every 3 listings share one timestamp on purpose, so ties must be broken by _id.
 */
async function insertListings(sellerId, count, { campusName = "MNIT Jaipur", category = "Books", newerByMs = 0 } = {}) {
  const now = Date.now();
  const docs = Array.from({ length: count }, (_, i) => ({
    title: `Listing ${i}`,
    description: "A listing used to test pagination",
    price: 100 + i,
    category,
    condition: "Good",
    images: ["https://example.com/book.jpg"],
    sellerId,
    status: "active",
    campusName,
    campusKey: toCampusKey(campusName),
    collegeId: "",
    urgency: "none",
    createdAt: new Date(now + newerByMs - Math.floor(i / 3) * 60_000),
    updatedAt: new Date(now),
  }));
  await Product.collection.insertMany(docs);
}

/** Follows nextCursor from the first page to the end and returns every item. */
async function walkCursor(query) {
  const items = [];
  let res = await request(app).get(`/api/products?${query}`).expect(200);
  items.push(...res.body.items);
  while (res.body.nextCursor) {
    res = await request(app)
      .get(`/api/products?${query}&cursor=${encodeURIComponent(res.body.nextCursor)}`)
      .expect(200);
    items.push(...res.body.items);
  }
  return items;
}

function assertOrdered(items, direction) {
  for (let i = 1; i < items.length; i += 1) {
    const [a, b] = [items[i - 1], items[i]];
    const [ta, tb] = [new Date(a.createdAt).getTime(), new Date(b.createdAt).getTime()];
    const ok =
      direction === "desc"
        ? ta > tb || (ta === tb && String(a._id) > String(b._id))
        : ta < tb || (ta === tb && String(a._id) < String(b._id));
    assert.ok(ok, `item ${i} is out of order`);
  }
}

async function sellerId() {
  const seller = await signupAndLogin(app);
  return { seller, id: new mongoose.Types.ObjectId(seller.user.id) };
}

test("'my campus' filter matches the campus whatever its case or spacing", async () => {
  const seller = await signupAndLogin(app, { campusName: "MNIT Jaipur" });
  const buyer = await signupAndLogin(app, { campusName: "  mnit   jaipur " });
  await createProduct(app, seller.token, { title: "Cycle for sale" });

  const res = await request(app)
    .get("/api/products?collegeScope=my_college")
    .set("Authorization", `Bearer ${buyer.token}`)
    .expect(200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].title, "Cycle for sale");
});

// limit=10 is deliberately NOT a multiple of the 3-listing tie groups, so a
// group of equal timestamps straddles each page boundary. With limit=12 the
// boundaries never split a group, and the tests would pass without the _id tie-breaker.

test("cursor pagination (newest first) returns every listing exactly once, in order", async () => {
  const { id } = await sellerId();
  await insertListings(id, 30);
  const items = await walkCursor("limit=10");
  assert.equal(items.length, 30);
  assert.equal(new Set(items.map((i) => String(i._id))).size, 30, "no listing may appear twice");
  assertOrdered(items, "desc");
});

test("cursor pagination works oldest first too", async () => {
  const { id } = await sellerId();
  await insertListings(id, 30);
  const items = await walkCursor("limit=10&sort=oldest");
  assert.equal(new Set(items.map((i) => String(i._id))).size, 30);
  assertOrdered(items, "asc");
});

test("cursor pagination keeps the filters on every page", async () => {
  const { id } = await sellerId();
  await insertListings(id, 30, { category: "Books" });
  await insertListings(id, 10, { category: "Furniture" });
  const items = await walkCursor("limit=10&category=Books");
  assert.equal(items.length, 30);
  assert.ok(items.every((i) => i.category === "Books"));
});

test("a cursor with a price sort, or a broken cursor, is rejected with 400", async () => {
  const { id } = await sellerId();
  await insertListings(id, 15);
  const first = await request(app).get("/api/products?limit=10").expect(200);
  await request(app)
    .get(`/api/products?limit=10&sort=price-low&cursor=${encodeURIComponent(first.body.nextCursor)}`)
    .expect(400);
  await request(app).get("/api/products?cursor=not-a-real-cursor").expect(400);
});

test("page numbers never repeat or skip a listing when timestamps tie", async () => {
  const { id } = await sellerId();
  await insertListings(id, 30);
  // q= forces a text-index plan with an in-memory sort. On the default path the
  // {status, createdAt, _id} index already returns ties in _id order, which would
  // hide a missing _id tie-breaker in the sort.
  const pages = await Promise.all(
    [1, 2, 3].map((page) => request(app).get(`/api/products?limit=10&q=listing&page=${page}`).expect(200))
  );
  const ids = pages.flatMap((res) => res.body.items.map((item) => String(item._id)));
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30, "a listing appeared on two pages");
  assert.equal(pages[0].body.totalPages, 3);
});

/** Turns on MongoDB's profiler while fn runs, then returns the recorded operations on products. */
async function profile(fn) {
  const db = mongoose.connection.db;
  const since = new Date();
  await db.command({ profile: 2 });
  try {
    await fn();
  } finally {
    await db.command({ profile: 0 });
  }
  return db
    .collection("system.profile")
    .find({ ns: `${db.databaseName}.products`, ts: { $gte: since } })
    .sort({ ts: 1 })
    .toArray();
}

test("a deep cursor page reads only about one page of index keys and documents", async () => {
  const { id } = await sellerId();
  await insertListings(id, 300);

  let res = await request(app).get("/api/products?limit=12").expect(200);
  for (let page = 2; page < 20; page += 1) {
    res = await request(app)
      .get(`/api/products?limit=12&cursor=${encodeURIComponent(res.body.nextCursor)}`)
      .expect(200);
  }

  // Profile page 20 (depth 228+). Without the createdAt bound the scan would
  // start at the newest listing and read about 240 keys and documents.
  const ops = await profile(() =>
    request(app)
      .get(`/api/products?limit=12&cursor=${encodeURIComponent(res.body.nextCursor)}`)
      .expect(200)
  );
  const find = ops.find((op) => op.command?.find === "products");
  assert.ok(find, "expected a find on products");
  assert.ok(find.keysExamined <= 16, `examined ${find.keysExamined} index keys`);
  assert.ok(find.docsExamined <= 16, `fetched ${find.docsExamined} documents`);
});

test("'my campus' reads only that campus's listings from the index", async () => {
  const { seller, id } = await sellerId(); // campus: MNIT Jaipur
  await insertListings(id, 30); // this campus
  await insertListings(id, 40, { campusName: "IIT Delhi", newerByMs: 60 * 60_000 }); // newer, other campus

  const ops = await profile(() =>
    request(app)
      .get("/api/products?collegeScope=my_college&limit=12")
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(200)
  );
  const find = ops.find((op) => op.command?.find === "products");
  assert.ok(find, "expected a find on products");
  assert.match(find.planSummary, /campusKey/, `plan: ${find.planSummary}`);
  assert.ok(!find.hasSortStage, "the index should give the order, without an in-memory sort");
  assert.ok(find.docsExamined <= 12, `fetched ${find.docsExamined} documents, including other campuses`);
});

test("startup migrations give old listings a campusKey, and running them twice is safe", async () => {
  const { seller, id } = await sellerId(); // signed up with "MNIT Jaipur"
  const base = {
    description: "Listed before campusKey existed",
    price: 50,
    category: "Books",
    condition: "Good",
    images: ["https://example.com/old.jpg"],
    sellerId: id,
    status: "active",
    collegeId: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await Product.collection.insertMany([
    { ...base, title: "Old A", campusName: "MNIT   JAIPUR" },
    { ...base, title: "Old B" }, // no campusName at all: comes from the seller
    { ...base, title: "Old C", campusName: "IIT Delhi" },
  ]);

  const myCampus = () =>
    request(app)
      .get("/api/products?collegeScope=my_college")
      .set("Authorization", `Bearer ${seller.token}`)
      .expect(200);

  assert.equal((await myCampus()).body.total, 0, "before the migration, old listings have no campusKey");

  await runStartupMigrations();
  const keys = (await Product.find().sort({ title: 1 }).lean()).map((p) => p.campusKey);
  assert.deepEqual(keys, ["mnit jaipur", "mnit jaipur", "iit delhi"]);
  assert.equal((await myCampus()).body.total, 2);

  await runStartupMigrations(); // second run: nothing left to change
  assert.equal((await myCampus()).body.total, 2);
});
