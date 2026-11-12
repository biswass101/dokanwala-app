import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreateCustomerInput,
  CreateCustomerPaymentInput,
  CustomerLedgerQuery,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customers.schema.js';
import {
  collectCustomerPayment,
  createCustomer,
  getCustomerById,
  getCustomerLedger,
  listCustomers,
  updateCustomer,
} from './customers.service.js';

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

export async function getCustomerByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const customer = await getCustomerById(auth.shopId, String(req.params.id));
    sendSuccess(req, res, { customer }, 200);
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

export async function updateCustomerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const customer = await updateCustomer(
      auth.shopId,
      auth.userId,
      String(req.params.id),
      req.body as UpdateCustomerInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { customer }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getCustomerLedgerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await getCustomerLedger(
      auth.shopId,
      String(req.params.id),
      req.query as unknown as CustomerLedgerQuery,
    );
    sendSuccess(req, res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function collectCustomerPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await collectCustomerPayment(
      auth.shopId,
      auth.userId,
      auth.role,
      String(req.params.id),
      req.body as CreateCustomerPaymentInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, result, result.idempotencyReplayed ? 200 : 201);
  } catch (err) {
    next(err);
  }
}
