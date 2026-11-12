import { ErrorCodes, type ApiErrorResponse } from '@dokanwala/shared';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../shared/errors/app-error.js';

function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): { statusCode: number; code: (typeof ErrorCodes)[keyof typeof ErrorCodes]; message: string } | null {
  switch (err.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: ErrorCodes.DUPLICATE_RESOURCE,
        message: 'A record with this unique value already exists',
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Requested resource was not found',
      };
    case 'P2003':
      return {
        statusCode: 400,
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Referenced resource does not exist',
      };
    case 'P2000':
    case 'P2004':
    case 'P2011':
    case 'P2012':
      return {
        statusCode: 400,
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Invalid input data for database constraint',
      };
    default:
      return null;
  }
}

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

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    if (mapped) {
      logger.warn({ prismaCode: err.code, requestId }, mapped.message);
      const body: ApiErrorResponse = {
        success: false,
        error: {
          code: mapped.code,
          message: mapped.message,
          requestId,
        },
      };
      res.status(mapped.statusCode).json(body);
      return;
    }
  }

  // Handle payload too large errors from body-parser / express.json()
  if (
    err instanceof Error &&
    'status' in err &&
    (err as { status?: number }).status === 413
  ) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Request payload exceeds maximum allowed size',
        requestId,
      },
    };
    res.status(413).json(body);
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
