import { PaymentMethods } from '@dokanwala/shared';
import { z } from 'zod';
import { nfcOptionalString } from '../../shared/validators/common.js';

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

export const cashbookDateQuerySchema = z.strictObject({
  businessDate: ymdDateSchema.optional(),
});

export type CashbookDateQuery = z.infer<typeof cashbookDateQuerySchema>;

export const openCashbookSchema = z.strictObject({
  businessDate: ymdDateSchema.optional(),
  openingCashPoisha: z.number().int().min(0).max(500_000_000),
  note: nfcOptionalString(300),
});

export type OpenCashbookInput = z.infer<typeof openCashbookSchema>;

export const closeCashbookSchema = z.strictObject({
  businessDate: ymdDateSchema.optional(),
  actualClosingCashPoisha: z.number().int().min(0).max(500_000_000),
  note: nfcOptionalString(300),
});

export type CloseCashbookInput = z.infer<typeof closeCashbookSchema>;

export const reopenCashbookSchema = z.strictObject({
  businessDate: ymdDateSchema.optional(),
  reason: nfcOptionalString(300),
});

export type ReopenCashbookInput = z.infer<typeof reopenCashbookSchema>;

export const createManualCashbookEntrySchema = z.strictObject({
  id: z.uuid().optional(),
  businessDate: ymdDateSchema.optional(),
  entryType: z.enum(['OWNER_CASH_IN', 'OWNER_DRAWING_OUT']),
  method: z.enum([
    PaymentMethods.CASH,
    PaymentMethods.BKASH,
    PaymentMethods.NAGAD,
    PaymentMethods.OTHER,
  ]),
  amountPoisha: z.number().int().positive().max(500_000_000),
  note: nfcOptionalString(300),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export type CreateManualCashbookEntryInput = z.infer<typeof createManualCashbookEntrySchema>;
