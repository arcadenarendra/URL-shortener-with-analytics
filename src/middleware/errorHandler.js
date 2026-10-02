import mongoose from 'mongoose';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

/** 404 for anything that fell through the router. */
export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}`));
}

/**
 * Single JSON error shape for the whole API:
 *   { error: { code, message, details? } }
 */
export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let code = err.code || (err.isApiError ? 'RATE_LIMITED' : 'INTERNAL_ERROR');
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = {
      issues: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'INVALID_ID';
    message = `Invalid value for ${err.path}`;
  } else if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `A record with that ${field} already exists`;
  }

  // Log 5xx loudly with the stack, 4xx quietly: client mistakes are not incidents.
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${status}`, err);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${status} ${code}`);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(config.isProd ? {} : { stack: err.stack }),
    },
  });
}
