const Joi = require("joi");
const { COLLEGE_IDS } = require("../config/colleges");

/** Stored image: absolute http(s) URL or server path under /uploads/ */
const productImageRef = Joi.alternatives().try(
  Joi.string().uri({ scheme: [/https?/] }),
  Joi.string().pattern(/^\/uploads\/[^/]+/i)
);

const baseProduct = {
  title: Joi.string().trim().min(3).max(120),
  description: Joi.string().trim().min(10).max(2000),
  price: Joi.number().min(0).max(10000000),
  category: Joi.string().trim().min(2).max(40),
  condition: Joi.string().trim().min(2).max(40),
  images: Joi.array().items(productImageRef).min(1).max(5),
  pickupLocation: Joi.string().trim().max(80).allow(""),
  negotiable: Joi.boolean(),
  urgency: Joi.string().valid("none", "moving_out", "flash_sale").optional(),
  urgencyNote: Joi.string().trim().max(120).allow(""),
};

const createProductSchema = Joi.object({
  ...baseProduct,
  title: baseProduct.title.required(),
  description: baseProduct.description.required(),
  price: baseProduct.price.required(),
  category: baseProduct.category.required(),
  condition: baseProduct.condition.required(),
  images: baseProduct.images.required(),
});

const updateProductSchema = Joi.object(baseProduct).min(1);

const listProductsQuerySchema = Joi.object({
  q: Joi.string().trim().allow(""),
  category: Joi.string().trim().max(40).allow(""),
  condition: Joi.string().trim().max(40).allow(""),
  sort: Joi.string().valid("newest", "oldest", "price-low", "price-high").default("newest"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(24).default(12),
  mine: Joi.string().valid("true", "1", "false", "0", "").optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  urgency: Joi.string().valid("moving_out", "flash_sale").optional(),
  /** Filter to one campus (slug). Empty = not set. */
  college: Joi.alternatives()
    .try(Joi.string().valid(...COLLEGE_IDS), Joi.string().allow(""))
    .optional(),
  /** all | my_college | nearby — ignored when `college` is a specific slug. */
  collegeScope: Joi.string().valid("all", "my_college", "nearby").default("all"),
  /** Case-insensitive substring match on listing `campusName` (ignored when `college` slug is set). */
  campusQ: Joi.string().trim().max(80).allow("").optional(),
});

module.exports = { createProductSchema, updateProductSchema, listProductsQuerySchema };
