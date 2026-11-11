import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  name: env.APP_NAME,
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.pin',
      '*.pinHash',
      '*.refreshToken',
      '*.accessToken',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
