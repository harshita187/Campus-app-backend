const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MulterError } = require("multer");
const errorHandler = require("../middleware/errorHandler");
const ApiError = require("../utils/ApiError");

const savedNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

/** Runs the error handler with a fake response and returns { status, body }. */
function run(err) {
  const out = {};
  const res = {
    status(code) {
      out.status = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    },
  };
  errorHandler(err, {}, res, () => {});
  return out;
}

test("server errors hide their message and stack when NODE_ENV is not set (as in production)", (t) => {
  delete process.env.NODE_ENV;
  t.mock.method(console, "error", () => {});
  const out = run(new Error("connect ECONNREFUSED 10.0.0.5:27017"));
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { message: "Internal server error" });
});

test("client errors keep their message and never include a stack", () => {
  delete process.env.NODE_ENV;
  const out = run(new ApiError(404, "Product not found"));
  assert.equal(out.status, 404);
  assert.deepEqual(out.body, { message: "Product not found" });
});

test("a malformed id is a 400", () => {
  const castError = new mongoose.Error.CastError("ObjectId", "abc", "_id");
  assert.equal(run(castError).status, 400);
});

test("schema validation errors are a 400 that names the field but never echoes its value", () => {
  const validation = new mongoose.Error.ValidationError();
  validation.addError(
    "text",
    new mongoose.Error.ValidatorError({ path: "text", message: "too long", value: "my private message" })
  );
  const out = run(validation);
  assert.equal(out.status, 400);
  assert.equal(out.body.message, "Invalid text");
  assert.ok(!JSON.stringify(out.body).includes("private"));
});

test("a duplicate key is a 409", () => {
  assert.equal(run(Object.assign(new Error("E11000 duplicate key"), { code: 11000 })).status, 409);
});

test("upload errors are a 400 (and too-large files a 413)", () => {
  assert.equal(run(new MulterError("LIMIT_UNEXPECTED_FILE", "file")).status, 400);
  assert.equal(run(new MulterError("LIMIT_FILE_SIZE", "image")).status, 413);
});
