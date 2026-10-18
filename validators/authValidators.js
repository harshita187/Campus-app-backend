const Joi = require("joi");

const signupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name must not exceed 80 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().trim().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(/[A-Z]/, "uppercase")
    .pattern(/[a-z]/, "lowercase")
    .pattern(/[0-9]/, "number")
    .required()
    .messages({
      "string.empty": "Password is required",
      "string.min": "Password must be at least 8 characters",
      "string.max": "Password must not exceed 64 characters",
      "string.pattern.name": "Password must contain uppercase letters, lowercase letters, and numbers",
      "any.required": "Password is required",
    }),
  phone: Joi.string().trim().min(8).max(20).required().messages({
    "string.empty": "Phone number is required",
    "string.min": "Phone number must be at least 8 characters",
    "string.max": "Phone number must not exceed 20 characters",
    "any.required": "Phone number is required",
  }),
  campusName: Joi.string().trim().min(2).max(120).required().messages({
    "string.empty": "Campus/Institute name is required",
    "string.min": "Campus name must be at least 2 characters",
    "string.max": "Campus name must not exceed 120 characters",
    "any.required": "Campus/Institute name is required",
  }),
  role: Joi.string().valid("buyer", "seller", "both").required().messages({
    "any.required": "Please select a role",
    "any.only": "Role must be buyer, seller, or both",
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

module.exports = { signupSchema, loginSchema };
