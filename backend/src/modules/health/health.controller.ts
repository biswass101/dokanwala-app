import type { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/response.js';
import { getHealthStatus } from './health.service.js';

export async function healthCheckController(req: Request, res: Response): Promise<void> {
  const status = await getHealthStatus();
  const httpCode = status.database === 'connected' ? 200 : 503;
  sendSuccess(req, res, status, httpCode);
}
