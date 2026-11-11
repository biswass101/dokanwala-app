import { normalizeBdPhone } from '@dokanwala/shared';
import { z } from 'zod';
import { nfcOptionalString, nfcRequiredString } from '../../shared/validators/common.js';

const optionalBdPhoneSchema = z
  .string()
  .trim()
  .max(20)
  .transform((val, ctx) => {
    if (val.length === 0) {
      return null;
    }
    const normalized = normalizeBdPhone(val);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Must be a valid Bangladeshi mobile number (e.g. 017XXXXXXXX)',
      });
      return z.NEVER;
    }
    return normalized;
  })
  .nullable()
  .optional();

export const listCustomersQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v.normalize('NFC'))
    .optional(),
  withDuesOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const createCustomerSchema = z.strictObject({
  id: z.uuid().optional(),
  nameBn: nfcRequiredString(1, 150),
  nameEn: nfcOptionalString(150),
  phone: optionalBdPhoneSchema,
  address: nfcOptionalString(300),
  note: nfcOptionalString(300),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
