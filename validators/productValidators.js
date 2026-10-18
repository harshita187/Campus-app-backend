const Joi = require("joi");
const { COLLEGE_IDS } = require("../config/colleges");

/** Stored image: absolute http(s) URL or server path under /uploads/ */
const productImageRef = Joi.alternatives().try(
  Joi.string().uri({ scheme: [/https?/] }),
  Joi.string().pattern(/^\/uploads\/[^/]+/i)
);

const baseProduct = {
  title: Joi.string().trim().min(3).max(120).messages({
    "string.min": "Title must be at least 3 characters",
    "string.max": "Title must not exceed 120 characters",
  }),
  description: Joi.string().trim().min(10).max(2000).messages({
    "string.min": "Description must be at least 10 characters",
    "string.max": "Description must not exceed 2000 characters",
  }),
  price: Joi.number().min(0).max(10000000).messages({
    "number.min": "Price cannot be negative",
    "number.max": "Price must not exceed 10000000",
  }),
  category: Joi.string().trim().min(2).max(40).messages({
    "string.min": "Category must be at least 2 characters",
    "string.max": "Category must not exceed 40 characters",
  }),
  condition: Joi.string().trim().min(2).max(40).messages({
    "string.min": "Condition must be at least 2 characters",
    "string.max": "Condition must not exceed 40 characters",
  }),
  images: Joi.array().items(productImageRef).min(1).max(5).messages({
    "array.min": "At least 1 image is required",
    "array.max": "Maximum 5 images allowed",
  }),
  pickupLocation: Joi.string().trim().max(80).allow("").messages({
    "string.max": "Pickup location must not exceed 80 characters",
  }),
  negotiable: Joi.boolean(),
  urgency: Joi.string().valid("none", "moving_out", "flash_sale").optional().messages({
    "any.only": "Urgency must be none, moving_out, or flash_sale",
  }),
  urgencyNote: Joi.string().trim().max(120).allow("").messages({
    "string.max": "Urgency note must not exceed 120 characters",
  }),
};

const createProductSchema = Joi.object({
  ...baseProduct,
  title: baseProduct.title.required().messages({
    "any.required": "Title is required",
  }),
  description: baseProduct.description.required().messages({
    "any.required": "Description is required",
  }),
  price: baseProduct.price.required().messages({
    "any.required": "Price is required",
  }),
  category: baseProduct.category.required().messages({
    "any.required": "Category is required",
  }),
  condition: baseProduct.condition.required().messages({
    "any.required": "Condition is required",
  }),
  images: baseProduct.images.required().messages({
    "any.required": "At least 1 image is required",
  }),
});

const updateProductSchema = Joi.object(baseProduct).min(1);

const listProductsQuerySchema = Joi.object({
  q: Joi.string().trim().allow(""),
  category: Joi.string().trim().max(40).allow(""),
  condition: Joi.string().trim().max(40).allow(""),
  sort: Joi.string().valid("newest", "oldest", "price-low", "price-high").default("newest").messages({
    "any.only": "Sort must be newest, oldest, price-low, or price-high",
  }),
  /** Opaque cursor from a previous response's nextCursor (sort=newest or oldest only). */
  cursor: Joi.string().trim().max(200).optional(),
  page: Joi.number().integer().min(1).default(1).messages({
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(24).default(12).messages({
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 24",
  }),
  mine: Joi.string().valid("true", "1", "false", "0", "").optional(),
  minPrice: Joi.number().min(0).optional().messages({
    "number.min": "Min price cannot be negative",
  }),
  maxPrice: Joi.number().min(0).optional().messages({
    "number.min": "Max price cannot be negative",
  }),
  urgency: Joi.string().valid("moving_out", "flash_sale").optional().messages({
    "any.only": "Urgency must be moving_out or flash_sale",
  }),
  college: Joi.alternatives()
    .try(Joi.string().valid(...COLLEGE_IDS), Joi.string().allow(""))
    .optional(),
  collegeScope: Joi.string().valid("all", "my_college", "nearby").default("all").messages({
    "any.only": "College scope must be all, my_college, or nearby",
  }),
  campusQ: Joi.string().trim().max(80).allow("").optional().messages({
    "string.max": "Campus search query must not exceed 80 characters",
  }),
});

module.exports = { createProductSchema, updateProductSchema, listProductsQuerySchema };
