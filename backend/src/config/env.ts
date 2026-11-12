import 'dotenv/config';
import { z } from 'zod';

const KNOWN_DEV_JWT_SECRETS = new Set([
  'replace-with-a-random-minimum-32-character-secret-key',
  'dokanwala-dev-jwt-secret-key-min-32-chars',
  'change-me-in-production-min-32-characters',
]);

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((val) => val === true || val === 'true' || val === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  APP_NAME: z.string().trim().min(1).default('dokanwala-api'),
  APP_VERSION: z.string().trim().min(1).default('0.1.0'),
  DEFAULT_TIMEZONE: z.string().trim().min(1).default('Asia/Dhaka'),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .trim()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_ACCESS_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  ALLOW_PUBLIC_REGISTRATION: booleanFromEnv.default(true),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: booleanFromEnv.default(false),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function validateProductionEnv(config: {
  NODE_ENV: 'development' | 'test' | 'production';
  JWT_ACCESS_SECRET: string;
  corsOriginList: readonly string[];
}): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  if (KNOWN_DEV_JWT_SECRETS.has(config.JWT_ACCESS_SECRET)) {
    throw new Error(
      'Invalid production configuration: JWT_ACCESS_SECRET must not use a known development placeholder',
    );
  }

  if (config.corsOriginList.length === 0) {
    throw new Error(
      'Invalid production configuration: CORS_ORIGINS must specify at least one allowed origin',
    );
  }
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${formatted}`);
}

const corsOriginList = parsed.data.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

validateProductionEnv({
  NODE_ENV: parsed.data.NODE_ENV,
  JWT_ACCESS_SECRET: parsed.data.JWT_ACCESS_SECRET,
  corsOriginList,
});

export const env = {
  ...parsed.data,
  corsOriginList,
} as const;

export type AppEnv = typeof env;
