import { ValidationError } from '../domain/errors.js';

// Checks the request body against a zod schema. The cleaned-up values go in req.validated
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(new ValidationError(result.error.issues[0].message));
    req.validated = result.data;
    next();
  };
}
