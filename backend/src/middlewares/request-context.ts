import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId =
    incomingId !== undefined && incomingId.trim().length > 0 && incomingId.length <= 64
      ? incomingId.trim()
      : `req_${crypto.randomUUID()}`;

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export const httpRequestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).requestId,
  customLogLevel: (_req, res, err) => {
    if (err !== undefined || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
