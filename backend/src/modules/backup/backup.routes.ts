import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { exportBackupHandler, restoreBackupHandler } from './backup.controller.js';
import { restoreBackupSchema } from './backup.schema.js';

export const backupRouter = Router();

backupRouter.use(requireAuth, requireRole('OWNER'));

backupRouter.get('/export', exportBackupHandler);

backupRouter.post(
  '/restore',
  validateRequest({ body: restoreBackupSchema }),
  restoreBackupHandler,
);
