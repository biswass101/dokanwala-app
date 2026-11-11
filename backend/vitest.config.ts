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
      LOG_LEVEL: 'silent',
    },
  },
});
