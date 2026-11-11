import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreateSupplierInput,
  CreateSupplierPaymentInput,
  ListSuppliersQuery,
  SupplierLedgerQuery,
  UpdateSupplierInput,
} from './suppliers.schema.js';
import {
  createSupplier,
  createSupplierPayment,
  getSupplierLedger,
  listSuppliers,
  updateSupplier,
} from './suppliers.service.js';

export async function listSuppliersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listSuppliers(auth.shopId, req.query as unknown as ListSuppliersQuery);
    sendSuccess(req, res, { suppliers: result.suppliers }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function createSupplierHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const supplier = await createSupplier(
      auth.shopId,
      auth.userId,
      req.body as CreateSupplierInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { supplier }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSupplierHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const supplier = await updateSupplier(
      auth.shopId,
      auth.userId,
      id,
      req.body as UpdateSupplierInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { supplier });
  } catch (err) {
    next(err);
  }
}

export async function getSupplierLedgerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await getSupplierLedger(
      auth.shopId,
      id,
      req.query as unknown as SupplierLedgerQuery,
    );
    sendSuccess(req, res, {
      supplier: result.supplier,
      entries: result.entries,
    });
  } catch (err) {
    next(err);
  }
}

export async function createSupplierPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await createSupplierPayment(
      auth.shopId,
      auth.userId,
      id,
      req.body as CreateSupplierPaymentInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        payment: result.payment,
        supplier: result.supplier,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}
