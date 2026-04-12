const Joi = require("joi");

const baseProduct = {
  title: Joi.string().trim().min(3).max(120),
  description: Joi.string().trim().min(10).max(2000),
  price: Joi.number().min(0).max(10000000),
  category: Joi.string().trim().valid(
    "Notes",
    "Cycle",
    "Dress",
    "Cooler",
    "Electronics",
    "Furniture",
    "Others"
  ),
  condition: Joi.string()
    .trim()
    .valid(
      "Like New",
      "Excellent",
      "Good",
      "Fair",
      "Brand New",
      "Open Box",
      "Heavily Used"
    ),
  images: Joi.array().items(Joi.string().uri()).min(1).max(5),
  pickupLocation: Joi.string().trim().max(80).allow(""),
  negotiable: Joi.boolean(),
  urgency: Joi.string().valid("none", "moving_out", "flash_sale").optional(),
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
  category: Joi.string()
    .trim()
    .valid("Notes", "Cycle", "Dress", "Cooler", "Electronics", "Furniture", "Others"),
  condition: Joi.string()
    .trim()
    .valid(
      "Like New",
      "Excellent",
      "Good",
      "Fair",
      "Brand New",
      "Open Box",
      "Heavily Used"
    ),
  sort: Joi.string().valid("newest", "oldest", "price-low", "price-high").default("newest"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(24).default(12),
  mine: Joi.string().valid("true", "1", "false", "0", "").optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  urgency: Joi.string().valid("moving_out", "flash_sale").optional(),
});

module.exports = { createProductSchema, updateProductSchema, listProductsQuerySchema };
