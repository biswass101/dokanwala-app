import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectDatabase } from '../../src/database/prisma.js';

describe('Backend foundation API', () => {
  const app = createApp();

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('GET /api/v1/health returns connected PostgreSQL status and security headers', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      status: 'ok',
      service: 'dokanwala-api',
      database: 'connected',
      timezone: 'Asia/Dhaka',
    });
  });

  it('returns consistent 404 JSON envelope for unknown routes', async () => {
    const response = await request(app)
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'req_custom_123');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe('req_custom_123');
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Route GET /api/v1/does-not-exist not found',
        details: {
          method: 'GET',
          path: '/api/v1/does-not-exist',
        },
        requestId: 'req_custom_123',
      },
    });
  });
});
