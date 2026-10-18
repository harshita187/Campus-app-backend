const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const {
  startTestServer,
  stopTestServer,
  clearDatabase,
  signupAndLogin,
} = require("./helpers");

let app;
let token;
before(async () => {
  app = await startTestServer();
});
after(stopTestServer);
beforeEach(async () => {
  await clearDatabase();
  ({ token } = await signupAndLogin(app));
});

function upload(content, filename, contentType) {
  return request(app)
    .post("/api/uploads/images")
    .set("Authorization", `Bearer ${token}`)
    .attach("image", Buffer.from(content), { filename, contentType });
}

test("an HTML file that claims to be an image is stored and served as a PNG, never as a page", async () => {
  const res = await upload("<script>alert('xss')</script>", "evil.html", "image/png").expect(201);
  assert.match(res.body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/, "the client's name and extension must not be used");

  const served = await request(app).get(res.body.url).expect(200);
  assert.match(served.headers["content-type"], /^image\/png/);
  assert.match(served.headers["content-security-policy"], /sandbox/);
  assert.equal(served.headers["x-content-type-options"], "nosniff");
});

test("SVG uploads are rejected (SVG can contain scripts)", async () => {
  await upload("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "logo.svg", "image/svg+xml").expect(400);
});

test("non-image uploads are rejected", async () => {
  await upload("<h1>hi</h1>", "page.html", "text/html").expect(400);
});
