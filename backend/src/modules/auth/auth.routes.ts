import { Router } from 'express';
import { authRateLimiter, requireAuth } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  loginController,
  logoutController,
  meController,
  pinLoginController,
  refreshController,
  registerController,
  setPinController,
} from './auth.controller.js';
import {
  loginSchema,
  logoutSchema,
  pinLoginSchema,
  refreshTokenSchema,
  registerSchema,
  setPinSchema,
} from './auth.schema.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validateRequest({ body: registerSchema }),
  registerController,
);

authRouter.post(
  '/login',
  authRateLimiter,
  validateRequest({ body: loginSchema }),
  loginController,
);

authRouter.post(
  '/pin-login',
  authRateLimiter,
  validateRequest({ body: pinLoginSchema }),
  pinLoginController,
);

authRouter.post(
  '/refresh',
  authRateLimiter,
  validateRequest({ body: refreshTokenSchema }),
  refreshController,
);

authRouter.post(
  '/logout',
  requireAuth,
  validateRequest({ body: logoutSchema }),
  logoutController,
);

authRouter.post(
  '/pin',
  requireAuth,
  validateRequest({ body: setPinSchema }),
  setPinController,
);

authRouter.get('/me', requireAuth, meController);
