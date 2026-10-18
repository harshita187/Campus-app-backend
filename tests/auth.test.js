const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const {
  startTestServer,
  stopTestServer,
  clearDatabase,
  signupAndLogin,
  cookieValue,
} = require("./helpers");

let app;
before(async () => {
  app = await startTestServer();
});
after(stopTestServer);
beforeEach(clearDatabase);

test("login returns an access token that works on /me", async () => {
  const session = await signupAndLogin(app);
  const res = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${session.token}`)
    .expect(200);
  assert.equal(res.body.email, session.user.email);
});

test("the refresh cookie gives a new access token", async () => {
  const session = await signupAndLogin(app);
  const res = await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", session.cookies)
    .expect(200);
  assert.ok(res.body.token);
});

test("a refresh token is rejected when used as an access token", async () => {
  const session = await signupAndLogin(app);
  const refreshToken = cookieValue(session.cookies, "refreshToken");
  assert.ok(refreshToken, "login should set a refreshToken cookie");

  // The refresh token lives 7 days. It must only work at /auth/refresh.
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${refreshToken}`)
    .expect(401);
  // The same check runs where signing in is optional ("my listings").
  await request(app)
    .get("/api/products?mine=1")
    .set("Authorization", `Bearer ${refreshToken}`)
    .expect(401);
});

test("'log out of all devices' revokes other devices' access tokens at once", async () => {
  const credentials = { email: "two.devices@college.edu", password: "Password123" };
  const laptop = await signupAndLogin(app, credentials);
  const phoneLogin = await request(app).post("/api/auth/login").send(credentials).expect(200);
  const phoneToken = phoneLogin.body.token;

  await request(app)
    .post("/api/auth/logout-all")
    .set("Authorization", `Bearer ${laptop.token}`)
    .expect(200);

  // The phone's access token has not expired yet, but it must stop working now.
  await request(app).get("/api/auth/me").set("Authorization", `Bearer ${phoneToken}`).expect(401);
  await request(app)
    .get("/api/products?mine=1")
    .set("Authorization", `Bearer ${phoneToken}`)
    .expect(401);

  // And its refresh token can no longer create new access tokens.
  await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", phoneLogin.headers["set-cookie"])
    .expect(401);
});

test("bad refresh cookies get 401, never a server error", async () => {
  const session = await signupAndLogin(app);
  const userId = session.user.id;
  const secret = process.env.JWT_SECRET;
  const expired = jwt.sign({ id: userId, tokenVersion: 0, type: "refresh" }, secret, { expiresIn: -10 });
  const accessInsteadOfRefresh = session.token;

  for (const value of ["garbage", expired, accessInsteadOfRefresh]) {
    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${value}`)
      .expect(401);
  }
});

test("failed logins are limited per client and email; other clients are not blocked", async () => {
  await signupAndLogin(app, { email: "target@college.edu" });
  const wrong = { email: "target@college.edu", password: "WrongPassword1" };

  // 10 failed attempts from one client...
  for (let i = 0; i < 10; i += 1) {
    await request(app).post("/api/auth/login").set("X-Forwarded-For", "1.1.1.1").send(wrong).expect(400);
  }
  // ...then that client is blocked for this email.
  await request(app).post("/api/auth/login").set("X-Forwarded-For", "1.1.1.1").send(wrong).expect(429);

  // A different client (behind the proxy, so a different X-Forwarded-For) is not blocked.
  await request(app).post("/api/auth/login").set("X-Forwarded-For", "2.2.2.2").send(wrong).expect(400);
});

test("signed-in requests such as /me are not rate-limited", async () => {
  const session = await signupAndLogin(app);
  for (let i = 0; i < 110; i += 1) {
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${session.token}`).expect(200);
  }
});
