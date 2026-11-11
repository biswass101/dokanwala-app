import { Router } from 'express';
import { healthCheckController } from './health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', healthCheckController);
