import type { ErrorCode } from '../constants/error-codes.js';

export interface PaginationMeta {
  page?: number;
  limit?: number;
  totalItems?: number;
  totalPages?: number;
  nextCursor?: string | null;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface HealthStatusPayload {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
  timezone: string;
}
