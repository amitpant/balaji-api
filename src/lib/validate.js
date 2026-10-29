import { HttpError } from '../middleware/error.js';

// Parses req.body with a Zod schema; on failure returns the contract's VALIDATION_ERROR shape.
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return next(new HttpError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', fields));
  }
  req.body = result.data;
  next();
};

// Wraps async handlers so thrown errors reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
