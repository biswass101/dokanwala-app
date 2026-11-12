import type { NextFunction, Request, Response } from 'express';
import { requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  DateRangeQuery,
  ExportReportQuery,
  ProductsReportQuery,
  SalesReportQuery,
} from './reports.schema.js';
import { exportReportFile } from './reports-export.service.js';
import {
  getDashboardSummary,
  getDuesReport,
  getProductsReport,
  getProfitLossReport,
  getSalesReport,
} from './reports.service.js';

export async function getDashboardSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const dashboard = await getDashboardSummary(auth.shopId, auth.role);
    sendSuccess(req, res, { dashboard }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getSalesReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as SalesReportQuery;
    const report = await getSalesReport(auth.shopId, auth.role, query.period, query.from, query.to);
    sendSuccess(req, res, { report }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getProductsReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as ProductsReportQuery;
    const report = await getProductsReport(
      auth.shopId,
      auth.role,
      query.from,
      query.to,
      query.limit,
    );
    sendSuccess(req, res, { report }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getProfitLossReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as DateRangeQuery;
    const report = await getProfitLossReport(auth.shopId, query.from, query.to);
    sendSuccess(req, res, { report }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getDuesReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const report = await getDuesReport(auth.shopId);
    sendSuccess(req, res, { report }, 200);
  } catch (err) {
    next(err);
  }
}

export async function exportReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as ExportReportQuery;
    const result = await exportReportFile({
      shopId: auth.shopId,
      role: auth.role,
      report: query.report,
      format: query.format,
      lang: query.lang,
      period: query.period,
      limit: query.limit,
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(result.buffer);
  } catch (err) {
    next(err);
  }
}
