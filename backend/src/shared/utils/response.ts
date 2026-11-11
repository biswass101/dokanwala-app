import type { ApiSuccessResponse, PaginationMeta } from '@dokanwala/shared';
import type { Request, Response } from 'express';

export function sendSuccess(
  req: Request,
  res: Response,
  data: unknown,
  statusCode = 200,
  pagination?: PaginationMeta,
): void {
  const payload: ApiSuccessResponse<unknown> = {
    success: true,
    data,
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      ...(pagination !== undefined ? { pagination } : {}),
    },
  };
  res.status(statusCode).json(payload);
}
