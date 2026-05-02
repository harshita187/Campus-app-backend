const test = require("node:test");
const assert = require("node:assert/strict");
const { signupSchema } = require("../validators/authValidators");
const { createProductSchema } = require("../validators/productValidators");

test("signup validator accepts valid payload", () => {
  const { error } = signupSchema.validate({
    name: "Test User",
    email: "test@college.edu",
    password: "Password123",
    phone: "9999999999",
    campusName: "Test College",
    role: "both",
  });
  assert.equal(error, undefined);
});

test("product validator rejects invalid payload", () => {
  const { error } = createProductSchema.validate({
    title: "Hi",
    price: -1,
  });
  assert.notEqual(error, undefined);
});
