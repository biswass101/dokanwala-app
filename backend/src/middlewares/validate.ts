import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../shared/errors/app-error.js';

interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        next(new ValidationError('Invalid route parameters', formatZodIssues(result.error)));
        return;
      }
      req.params = result.data as Request['params'];
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        next(new ValidationError('Invalid query parameters', formatZodIssues(result.error)));
        return;
      }
      // Express 5 defines `req.query` as a prototype getter; shadow with parsed values safely
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        next(new ValidationError('Invalid request body', formatZodIssues(result.error)));
        return;
      }
      req.body = result.data;
    }

    next();
  };
}

function formatZodIssues(error: z.ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}
