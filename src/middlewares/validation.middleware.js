const { validationResult } = require('express-validator');

const validate = (schema, source = 'body') => {
  if (Array.isArray(schema)) {
    return [
      ...schema,
      (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            status:  'fail',
            message: 'COMMON.VALIDATION_DATA_ERROR',
            errors:  errors.array().map((e) => e.msg),
          });
        }
        next();
      },
    ];
  }
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        status:  'fail',
        message: 'COMMON.VALIDATION_DATA_ERROR',
        errors:  error.details.map((e) => e.message.replace(/"/g, '')),
      });
    }
    req[source] = value;
    next();
  };
};

module.exports = validate;
