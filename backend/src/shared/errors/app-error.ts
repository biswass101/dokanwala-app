import { ErrorCodes, type ErrorCode } from '@dokanwala/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(params: {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    isOperational?: boolean;
  }) {
    super(params.message);
    this.name = new.target.name;
    this.statusCode = params.statusCode;
    this.code = params.code;
    if (params.details !== undefined) {
      this.details = params.details;
    }
    this.isOperational = params.isOperational ?? true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: Record<string, unknown>) {
    super({
      statusCode: 400,
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = 'Authentication required',
    code: ErrorCode = ErrorCodes.UNAUTHORIZED,
    details?: Record<string, unknown>,
  ) {
    super({
      statusCode: 401,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'Insufficient permissions',
    code: ErrorCode = ErrorCodes.FORBIDDEN_ROLE,
    details?: Record<string, unknown>,
  ) {
    super({
      statusCode: 403,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource was not found', details?: Record<string, unknown>) {
    super({
      statusCode: 404,
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'Resource conflict detected',
    code: ErrorCode = ErrorCodes.VERSION_CONFLICT,
    details?: Record<string, unknown>,
  ) {
    super({
      statusCode: 409,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class BusinessRuleError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.BUSINESS_RULE_VIOLATION,
    details?: Record<string, unknown>,
  ) {
    super({
      statusCode: 422,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}
