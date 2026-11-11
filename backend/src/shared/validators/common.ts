import {
  isValidPinFormat,
  normalizeBdPhone,
  normalizePinInput,
  normalizeUnicodeText,
  PASSWORD_MIN_LENGTH,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
} from '@dokanwala/shared';
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
    .string()
    .transform((val) => {
      const normalized = normalizeUnicodeText(val);
      return normalized.length === 0 ? null : normalized;
    })
    .pipe(z.string().max(max).nullable())
    .optional();
}
