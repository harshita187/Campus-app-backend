const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const {
  startTestServer,
  stopTestServer,
  clearDatabase,
  signupAndLogin,
  createProduct,
} = require("./helpers");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

let app;
before(async () => {
  app = await startTestServer();
});
after(stopTestServer);
beforeEach(clearDatabase);

async function startChat(token, productId) {
  return request(app)
    .post(`/api/chat/conversations/product/${productId}`)
    .set("Authorization", `Bearer ${token}`);
}

test("parallel 'start chat' requests create exactly one conversation", async () => {
  const seller = await signupAndLogin(app);
  const buyer = await signupAndLogin(app);
  const product = await createProduct(app, seller.token);

  // A double-click (or two open tabs) sends the same request at the same time.
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => startChat(buyer.token, product._id))
  );

  for (const res of responses) {
    assert.ok([200, 201].includes(res.status), `expected 200/201, got ${res.status}: ${res.body.message}`);
  }
  assert.equal(responses.filter((res) => res.status === 201).length, 1, "exactly one request creates it");
  const ids = new Set(responses.map((res) => String(res.body._id)));
  assert.equal(ids.size, 1, "every request should get the same conversation");
  assert.equal(await Conversation.countDocuments(), 1);
});

test("starting a chat again returns the existing conversation with 200", async () => {
  const seller = await signupAndLogin(app);
  const buyer = await signupAndLogin(app);
  const product = await createProduct(app, seller.token);

  const first = await startChat(buyer.token, product._id);
  assert.equal(first.status, 201);
  const second = await startChat(buyer.token, product._id);
  assert.equal(second.status, 200);
  assert.equal(String(second.body._id), String(first.body._id));
});

test("if the upsert loses a race on the unique index, the existing conversation is returned", async (t) => {
  const seller = await signupAndLogin(app);
  const buyer = await signupAndLogin(app);
  const product = await createProduct(app, seller.token);
  const first = await startChat(buyer.token, product._id);

  // Simulate the rare case where two upserts collide and MongoDB answers E11000.
  t.mock.method(Conversation, "findOneAndUpdate", async () => {
    throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
  });

  const res = await startChat(buyer.token, product._id);
  assert.equal(res.status, 200);
  assert.equal(String(res.body._id), String(first.body._id));
});

test("a seller cannot start a chat on their own listing", async () => {
  const seller = await signupAndLogin(app);
  const product = await createProduct(app, seller.token);
  const res = await startChat(seller.token, product._id);
  assert.equal(res.status, 400);
});

test("only the buyer and seller can read a conversation", async () => {
  const seller = await signupAndLogin(app);
  const buyer = await signupAndLogin(app);
  const stranger = await signupAndLogin(app);
  const product = await createProduct(app, seller.token);
  const convo = await startChat(buyer.token, product._id);

  await request(app)
    .get(`/api/chat/conversations/${convo.body._id}/messages`)
    .set("Authorization", `Bearer ${stranger.token}`)
    .expect(403);
});

test("a malformed conversation id returns 400, not a server error", async () => {
  const buyer = await signupAndLogin(app);
  await request(app)
    .get("/api/chat/conversations/not-a-valid-id/messages")
    .set("Authorization", `Bearer ${buyer.token}`)
    .expect(400);
});

test("a message over 1000 characters is rejected with 400 and not saved", async () => {
  const seller = await signupAndLogin(app);
  const buyer = await signupAndLogin(app);
  const product = await createProduct(app, seller.token);
  const convo = await startChat(buyer.token, product._id);

  const res = await request(app)
    .post(`/api/chat/conversations/${convo.body._id}/messages`)
    .set("Authorization", `Bearer ${buyer.token}`)
    .send({ text: "a".repeat(1001) })
    .expect(400);
  assert.match(res.body.message, /1000/);
  assert.equal(await Message.countDocuments(), 0);
});
