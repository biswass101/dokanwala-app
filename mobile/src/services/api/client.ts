import {
  ErrorCodes,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type AuthTokensDto,
  type ErrorCode,
} from '@dokanwala/shared';
import {
  AxiosError,
  create,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  getOrCreateDeviceId,
  getStoredAccessToken,
  getStoredRefreshToken,
  saveAuthTokens,
} from '@/services/auth/secure-session';
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

let onSessionInvalidatedCallback: (() => Promise<void> | void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function registerSessionInvalidatedHandler(handler: () => Promise<void> | void): void {
  onSessionInvalidatedCallback = handler;
}

export const apiClient: AxiosInstance = create({
  baseURL: getApiBaseUrl(),
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

const rawRefreshClient: AxiosInstance = create({
  baseURL: getApiBaseUrl(),
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      return null;
    }
    const deviceId = await getOrCreateDeviceId();
    try {
      const res = await rawRefreshClient.post<ApiSuccessResponse<AuthTokensDto>>(
        '/auth/refresh',
        { refreshToken },
        { headers: { 'X-Device-Id': deviceId } },
      );
      const tokens = res.data.data;
      await saveAuthTokens(tokens.accessToken, tokens.refreshToken);
      return tokens.accessToken;
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        if (onSessionInvalidatedCallback) {
          await onSessionInvalidatedCallback();
        }
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

apiClient.interceptors.request.use(async (config) => {
  const language = usePreferencesStore.getState().language;
  config.headers.set('Accept-Language', language);

  const [accessToken, deviceId] = await Promise.all([
    getStoredAccessToken(),
    getOrCreateDeviceId(),
  ]);
  config.headers.set('X-Device-Id', deviceId);
  if (accessToken && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return config;
});

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retryAttempted?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (error instanceof AxiosError) {
      const originalConfig = error.config as RetryableRequestConfig | undefined;
      const url = originalConfig?.url ?? '';
      const isAuthEndpoint =
        url.includes('/auth/login') ||
        url.includes('/auth/pin-login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh');

      if (
        error.response?.status === 401 &&
        originalConfig &&
        !originalConfig._retryAttempted &&
        !isAuthEndpoint
      ) {
        originalConfig._retryAttempted = true;
        const nextAccessToken = await refreshAccessTokenOnce();
        if (nextAccessToken) {
          originalConfig.headers.set('Authorization', `Bearer ${nextAccessToken}`);
          return apiClient.request(originalConfig);
        }
      }

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

export async function unwrapApiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<ApiSuccessResponse<T>>(url, params ? { params } : undefined);
  return response.data.data;
}

export async function unwrapApiPost<T>(
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await apiClient.post<ApiSuccessResponse<T>>(
    url,
    body,
    headers ? { headers } : undefined,
  );
  return response.data.data;
}

export async function unwrapApiPatch<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiClient.patch<ApiSuccessResponse<T>>(url, body);
  return response.data.data;
}

export async function unwrapApiPut<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiClient.put<ApiSuccessResponse<T>>(url, body);
  return response.data.data;
}

export async function unwrapApiDelete<T>(url: string): Promise<T> {
  const response = await apiClient.delete<ApiSuccessResponse<T>>(url);
  return response.data.data;
}
