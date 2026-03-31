const ApiError = require("../utils/ApiError");

const validate = (schema, source = "body") => (req, _res, next) => {
  const { value, error } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const message = error.details.map((d) => d.message).join(", ");
    return next(new ApiError(400, message));
  }

  req[source] = value;
  return next();
};

module.exports = validate;
