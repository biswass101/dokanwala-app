import {
  ErrorCodes,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type ErrorCode,
} from '@dokanwala/shared';
import { AxiosError, create, type AxiosInstance } from 'axios';
import { usePreferencesStore } from '@/store/preferences.store';

export class ApiClientError extends Error {
  public readonly code: ErrorCode | 'NETWORK_ERROR';
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(params: {
    code: ErrorCode | 'NETWORK_ERROR';
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    if (params.details !== undefined) {
      this.details = params.details;
    }
    if (params.requestId !== undefined) {
      this.requestId = params.requestId;
    }
  }
}

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;
}

export const apiClient: AxiosInstance = create({
  baseURL: getApiBaseUrl(),
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const language = usePreferencesStore.getState().language;
  config.headers.set('Accept-Language', language);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError) {
      const apiErr = error.response?.data as ApiErrorResponse | undefined;
      if (apiErr && apiErr.success === false && apiErr.error) {
        return Promise.reject(
          new ApiClientError({
            code: apiErr.error.code,
            message: apiErr.error.message,
            statusCode: error.response?.status ?? 500,
            ...(apiErr.error.details !== undefined ? { details: apiErr.error.details } : {}),
            requestId: apiErr.error.requestId,
          }),
        );
      }

      if (!error.response) {
        return Promise.reject(
          new ApiClientError({
            code: 'NETWORK_ERROR',
            message: error.message || 'Network request failed',
            statusCode: 0,
          }),
        );
      }

      return Promise.reject(
        new ApiClientError({
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message,
          statusCode: error.response.status,
        }),
      );
    }

    return Promise.reject(error);
  },
);

export async function unwrapApiGet<T>(url: string): Promise<T> {
  const response = await apiClient.get<ApiSuccessResponse<T>>(url);
  return response.data.data;
}
