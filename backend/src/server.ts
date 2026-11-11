import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkDatabaseConnection, disconnectDatabase } from './database/prisma.js';

async function bootstrap(): Promise<void> {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    logger.warn('PostgreSQL is not reachable at startup; /api/v1/health will report degraded');
  } else {
    logger.info('PostgreSQL connection verified');
  }

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { host: env.HOST, port: env.PORT, env: env.NODE_ENV, timezone: env.DEFAULT_TIMEZONE },
      `${env.APP_NAME} listening on http://${env.HOST}:${String(env.PORT)}`,
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    server.close(() => {
      void disconnectDatabase()
        .then(() => {
          logger.info('Database disconnected; exiting');
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Error disconnecting database during shutdown');
          process.exit(1);
        });
    });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

void bootstrap();
