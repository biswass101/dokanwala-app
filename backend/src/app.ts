import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { attachRequestId, httpRequestLogger } from './middlewares/request-context.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { categoriesRouter } from './modules/categories/categories.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { productsRouter } from './modules/products/products.routes.js';
import { shopRouter } from './modules/shop/shop.routes.js';
import { unitsRouter } from './modules/units/units.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(attachRequestId);
  app.use(httpRequestLogger);
  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          // Native mobile apps & curl do not send an Origin header
          callback(null, true);
          return;
        }
        if (env.corsOriginList.includes(origin)) {
          callback(null, true);
          return;
        }
        if (env.NODE_ENV === 'development' && env.corsOriginList.length === 0) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept-Language',
        'X-Idempotency-Key',
        'X-Device-Id',
        'X-Request-Id',
      ],
    }),
  );

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => env.NODE_ENV === 'test',
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  const v1Router = express.Router();
  v1Router.use('/health', healthRouter);
  v1Router.use('/auth', authRouter);
  v1Router.use('/shop', shopRouter);
  v1Router.use('/categories', categoriesRouter);
  v1Router.use('/units', unitsRouter);
  v1Router.use('/products', productsRouter);
  v1Router.use('/inventory', inventoryRouter);

  app.use('/api/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
