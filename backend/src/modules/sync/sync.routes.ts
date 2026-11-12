import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { pullSyncHandler, pushSyncHandler } from './sync.controller.js';
import { syncPullQuerySchema, syncPushSchema } from './sync.schema.js';

export const syncRouter = Router();

syncRouter.use(requireAuth);

syncRouter.post('/push', validateRequest({ body: syncPushSchema }), pushSyncHandler);

syncRouter.get('/pull', validateRequest({ query: syncPullQuerySchema }), pullSyncHandler);
