import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CancelSaleInput,
  CreateSaleInput,
  CreateSaleReturnInput,
  ListSalesQuery,
  ReceiptPdfQuery,
} from './sales.schema.js';
import { generateSaleReceiptPdf } from './sales-receipt-pdf.service.js';
import {
  cancelSale,
  createSale,
  createSaleReturn,
  getSaleById,
  listSales,
} from './sales.service.js';

export async function listSalesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listSales(auth.shopId, auth.role, req.query as unknown as ListSalesQuery);
    sendSuccess(req, res, { sales: result.sales }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function getSaleByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const sale = await getSaleById(auth.shopId, auth.role, id);
    sendSuccess(req, res, { sale });
  } catch (err) {
    next(err);
  }
}

export async function createSaleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await createSale(
      auth.shopId,
      auth.userId,
      auth.role,
      req.body as CreateSaleInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        sale: result.sale,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}

export async function createSaleReturnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await createSaleReturn(
      auth.shopId,
      auth.userId,
      auth.role,
      id,
      req.body as CreateSaleReturnInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        sale: result.sale,
        saleReturn: result.saleReturn,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}

export async function cancelSaleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await cancelSale(
      auth.shopId,
      auth.userId,
      auth.role,
      id,
      req.body as CancelSaleInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        sale: result.sale,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      200,
    );
  } catch (err) {
    next(err);
  }
}

export async function getSaleReceiptPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const query = req.query as unknown as ReceiptPdfQuery;
    const pdf = await generateSaleReceiptPdf(auth.shopId, auth.role, id, query.lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(pdf.buffer);
  } catch (err) {
    next(err);
  }
}
