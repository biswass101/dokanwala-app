import type { HealthStatusPayload } from '@dokanwala/shared';
import { env } from '../../config/env.js';
import { checkDatabaseConnection } from '../../database/prisma.js';

export async function getHealthStatus(): Promise<HealthStatusPayload> {
  const dbConnected = await checkDatabaseConnection();

  return {
    status: dbConnected ? 'ok' : 'degraded',
    service: env.APP_NAME,
    version: env.APP_VERSION,
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    timezone: env.DEFAULT_TIMEZONE,
  };
}
