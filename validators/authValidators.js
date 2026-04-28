const Joi = require("joi");

const signupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(/[A-Z]/, "uppercase")
    .pattern(/[a-z]/, "lowercase")
    .pattern(/[0-9]/, "number")
    .required(),
  phone: Joi.string().trim().min(8).max(20).required(),
  campusName: Joi.string().trim().min(2).max(120).required(),
  role: Joi.string().valid("buyer", "seller", "both").required(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

module.exports = { signupSchema, loginSchema };
