import { ErrorCodes, type ApiErrorResponse } from '@dokanwala/shared';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../shared/errors/app-error.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const maybeRequestId = (req as { requestId?: string }).requestId;
  const requestId = maybeRequestId ?? 'unknown';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, err.message);
    } else {
      logger.warn({ code: err.code, statusCode: err.statusCode, requestId }, err.message);
    }

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: {
          issues: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        requestId,
      },
    };
    res.status(400).json(body);
    return;
  }

  // Handle malformed JSON body syntax errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Malformed JSON payload',
        requestId,
      },
    };
    res.status(400).json(body);
    return;
  }

  logger.error({ err, requestId }, 'Unhandled server error');

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err instanceof Error
            ? err.message
            : 'An unexpected error occurred',
      requestId,
    },
  };
  res.status(500).json(body);
}
