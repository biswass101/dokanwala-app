import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type { CreateCustomerInput, ListCustomersQuery } from './customers.schema.js';
import { createCustomer, listCustomers } from './customers.service.js';

export async function listCustomersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listCustomers(auth.shopId, req.query as unknown as ListCustomersQuery);
    sendSuccess(req, res, { customers: result.customers }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function createCustomerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const customer = await createCustomer(
      auth.shopId,
      auth.userId,
      req.body as CreateCustomerInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { customer }, 201);
  } catch (err) {
    next(err);
  }
}
