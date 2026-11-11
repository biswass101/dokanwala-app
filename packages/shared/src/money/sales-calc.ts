import { Decimal } from 'decimal.js';
import type { DiscountType } from '../types/sales.js';
import { normalizeNumericInput } from '../validation/bangla-input.js';

export function calculateDiscountPoisha(
  subtotalPoisha: number,
  discountType: DiscountType,
  discountValue: string | number,
): number {
  if (!Number.isSafeInteger(subtotalPoisha) || subtotalPoisha < 0) {
    throw new Error('Subtotal must be a non-negative integer in poisha');
  }

  const rawDec =
    typeof discountValue === 'number'
      ? new Decimal(discountValue)
      : new Decimal(normalizeNumericInput(discountValue) || '0');

  if (!rawDec.isFinite() || rawDec.isNegative()) {
    throw new Error('Discount value cannot be negative');
  }

  if (discountType === 'FIXED_POISHA') {
    const fixedPoisha = rawDec.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    if (!Number.isSafeInteger(fixedPoisha)) {
      throw new Error('Discount poisha out of safe integer range');
    }
    return fixedPoisha;
  }

  if (rawDec.gt(100)) {
    throw new Error('Percentage discount cannot exceed 100%');
  }

  const percentPoisha = new Decimal(subtotalPoisha)
    .times(rawDec)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  if (!Number.isSafeInteger(percentPoisha)) {
    throw new Error('Calculated discount out of safe integer range');
  }
  return percentPoisha;
}

/**
 * Allocates invoice-level discount onto returned items deterministically.
 * Guarantees cumulative discount adjustment never exceeds original invoice discount,
 * and returning all remaining quantities settles 100% of remaining discount.
 */
export function calculateProportionalReturnDiscount(params: {
  returnSubtotalPoisha: number;
  saleSubtotalPoisha: number;
  totalDiscountPoisha: number;
  alreadyDiscountAdjustedPoisha: number;
  isFullRemainingReturn: boolean;
}): number {
  const remainingDiscount = Math.max(
    0,
    params.totalDiscountPoisha - params.alreadyDiscountAdjustedPoisha,
  );
  if (remainingDiscount === 0 || params.saleSubtotalPoisha <= 0) {
    return 0;
  }
  if (params.isFullRemainingReturn) {
    return Math.min(params.returnSubtotalPoisha, remainingDiscount);
  }
  const proportional = new Decimal(params.totalDiscountPoisha)
    .times(params.returnSubtotalPoisha)
    .dividedBy(params.saleSubtotalPoisha)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return Math.min(params.returnSubtotalPoisha, remainingDiscount, Math.max(0, proportional));
}

export function doesDiscountExceedPercentCap(
  subtotalPoisha: number,
  discountPoisha: number,
  maxPercent: number,
): boolean {
  if (discountPoisha <= 0) {
    return false;
  }
  if (subtotalPoisha <= 0) {
    return true;
  }
  return new Decimal(discountPoisha).times(100).gt(new Decimal(subtotalPoisha).times(maxPercent));
}
