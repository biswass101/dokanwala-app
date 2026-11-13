import { z } from 'zod';

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

export const dashboardQuerySchema = z.strictObject({
  period: z.enum(['day', 'week', 'month']).optional().default('day'),
  date: ymdDateSchema.optional(),
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dateRangeQuerySchema = z.strictObject({
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const salesReportQuerySchema = z.strictObject({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
});

export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;

export const productsReportQuerySchema = z.strictObject({
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ProductsReportQuery = z.infer<typeof productsReportQuerySchema>;

export const exportReportQuerySchema = z.strictObject({
  report: z.enum(['sales', 'profit-loss', 'products', 'dues']),
  format: z.enum(['csv', 'pdf']),
  lang: z.enum(['bn', 'en']).default('bn'),
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>;
