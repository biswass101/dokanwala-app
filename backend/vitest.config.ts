import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://dokanwala:dokanwala_test_pass@localhost:5434/dokanwala_test?schema=public',
      JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-characters',
      JWT_ACCESS_EXPIRES_IN_SECONDS: '900',
      REFRESH_TOKEN_EXPIRES_DAYS: '30',
      ALLOW_PUBLIC_REGISTRATION: 'true',
      AUTH_MAX_FAILED_ATTEMPTS: '5',
      AUTH_LOCKOUT_MINUTES: '15',
      LOG_LEVEL: 'silent',
    },
  },
});
