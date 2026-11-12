import {
  isValidPinFormat,
  normalizeBdPhone,
  normalizeNumericInput,
  normalizePinInput,
  normalizeUnicodeText,
  PASSWORD_MIN_LENGTH,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { z } from 'zod';

export const uuidParamSchema = z.strictObject({
  id: z.uuid('Invalid UUID identifier'),
});

export const bdPhoneSchema = z
  .string()
  .trim()
  .min(11, 'Phone number is required')
  .max(20)
  .transform((val, ctx) => {
    const normalized = normalizeBdPhone(val);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Must be a valid Bangladeshi mobile number (e.g. 017XXXXXXXX)',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const pinSchema = z
  .string()
  .trim()
  .transform((val, ctx) => {
    if (!isValidPinFormat(val)) {
      ctx.addIssue({
        code: 'custom',
        message: `PIN must be ${String(PIN_MIN_LENGTH)} to ${String(PIN_MAX_LENGTH)} numeric digits`,
      });
      return z.NEVER;
    }
    return normalizePinInput(val);
  });

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters long`,
  )
  .max(128, 'Password cannot exceed 128 characters');

export function nfcRequiredString(min = 1, max = 150) {
  return z
    .string()
    .transform((val) => normalizeUnicodeText(val))
    .pipe(z.string().min(min).max(max));
}

export function nfcOptionalString(max = 300) {
  return z
    .union([z.string(), z.null()])
    .transform((val) => {
      if (val === null) return null;
      const normalized = normalizeUnicodeText(val);
      return normalized.length === 0 ? null : normalized;
    })
    .pipe(z.string().max(max).nullable())
    .optional();
}

export function decimalQuantitySchema(params: {
  allowZero: boolean;
  decimals?: number;
  label?: string;
}) {
  const { allowZero, decimals = 4, label = 'Quantity' } = params;
  return z
    .union([z.string(), z.number()])
    .transform((raw, ctx) => {
      const str = typeof raw === 'number' ? String(raw) : normalizeNumericInput(raw);
      if (!str || !/^-?\d+(?:\.\d+)?$/.test(str)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a valid decimal number` });
        return z.NEVER;
      }
      try {
        const dec = new Decimal(str);
        if (!dec.isFinite() || dec.isNegative() || (!allowZero && dec.lte(0))) {
          ctx.addIssue({
            code: 'custom',
            message: allowZero
              ? `${label} must be zero or greater`
              : `${label} must be greater than zero`,
          });
          return z.NEVER;
        }
        return dec.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals);
      } catch {
        ctx.addIssue({ code: 'custom', message: `${label} is invalid` });
        return z.NEVER;
      }
    });
}

export const nonNegativePoishaSchema = z
  .number()
  .int('Amount in poisha must be an integer')
  .min(0, 'Amount cannot be negative')
  .max(Number.MAX_SAFE_INTEGER);
