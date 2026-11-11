import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  APP_NAME: z.string().trim().min(1).default('dokanwala-api'),
  APP_VERSION: z.string().trim().min(1).default('0.1.0'),
  DEFAULT_TIMEZONE: z.string().trim().min(1).default('Asia/Dhaka'),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${formatted}`);
}

export const env = {
  ...parsed.data,
  corsOriginList: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
} as const;

export type AppEnv = typeof env;
