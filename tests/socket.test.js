const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const {
  startTestServer,
  stopTestServer,
  clearDatabase,
  signupAndLogin,
  cookieValue,
} = require("./helpers");

let app;
let port;
const clients = [];

before(async () => {
  app = await startTestServer();
  // Socket tests need a real listening server (supertest does not open one).
  const server = app.get("io").httpServer;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});
after(async () => {
  clients.forEach((client) => client.close());
  app.get("io").close();
  await stopTestServer();
});
beforeEach(clearDatabase);

/** Fails (instead of hanging forever) when an expected event never arrives. */
function within(ms, promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no ${what} within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Opens a socket and resolves with { socket, error } once it connects or is refused. */
function connect(token) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  const settled = new Promise((resolve) => {
    socket.once("connect", () => resolve({ socket, error: null }));
    socket.once("connect_error", (error) => resolve({ socket, error }));
  });
  return within(3000, settled, "connect or connect_error");
}

test("a valid access token opens a chat socket", async () => {
  const session = await signupAndLogin(app);
  const { error } = await connect(session.token);
  assert.equal(error, null);
});

test("a refresh token cannot open a chat socket", async () => {
  const session = await signupAndLogin(app);
  const { error } = await connect(cookieValue(session.cookies, "refreshToken"));
  assert.equal(error?.message, "Unauthorized");
});

test("'log out of all devices' closes open sockets and blocks reconnecting", async () => {
  const credentials = { email: "socket.user@college.edu", password: "Password123" };
  const laptop = await signupAndLogin(app, credentials);
  const phoneLogin = await request(app).post("/api/auth/login").send(credentials).expect(200);
  const phone = await connect(phoneLogin.body.token);
  assert.equal(phone.error, null);

  const disconnected = new Promise((resolve) => phone.socket.once("disconnect", resolve));
  await request(app)
    .post("/api/auth/logout-all")
    .set("Authorization", `Bearer ${laptop.token}`)
    .expect(200);

  // The server closed the phone's socket (not a network drop).
  assert.equal(await within(3000, disconnected, "disconnect"), "io server disconnect");

  // And the old token cannot open a new one.
  const retry = await connect(phoneLogin.body.token);
  assert.equal(retry.error?.message, "Unauthorized");
});
