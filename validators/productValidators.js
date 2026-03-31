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
  condition: Joi.string().trim().valid("Like New", "Excellent", "Good", "Fair"),
  images: Joi.array().items(Joi.string().uri()).min(1).max(5),
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
  condition: Joi.string().trim().valid("Like New", "Excellent", "Good", "Fair"),
  sort: Joi.string().valid("newest", "oldest", "price-low", "price-high").default("newest"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(24).default(12),
});

module.exports = { createProductSchema, updateProductSchema, listProductsQuerySchema };
