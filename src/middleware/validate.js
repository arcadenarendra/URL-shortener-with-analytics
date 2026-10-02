import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Validate and replace req.body / req.query / req.params with the parsed result,
 * so handlers only ever see coerced, whitelisted values.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // req.query is a getter in Express 5; assign to a plain field instead.
        req.validatedQuery = schemas.query.parse(req.query);
      }
      if (schemas.params) req.params = schemas.params.parse(req.params);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', {
            issues: err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
          })
        );
      }
      return next(err);
    }
  };
}

export default validate;
