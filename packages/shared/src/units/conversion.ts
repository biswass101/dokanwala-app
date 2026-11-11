import { Decimal } from 'decimal.js';
import { normalizeNumericInput } from '../validation/bangla-input.js';

const QTY_DECIMAL_PLACES = 4;

export function convertToBaseQuantity(
  qtyDisplay: string | number,
  conversionFactorToBase: string | number,
): string {
  const qty = new Decimal(
    typeof qtyDisplay === 'number' ? qtyDisplay : normalizeNumericInput(qtyDisplay),
  );
  const factor = new Decimal(
    typeof conversionFactorToBase === 'number'
      ? conversionFactorToBase
      : normalizeNumericInput(conversionFactorToBase),
  );

  if (!qty.isFinite() || qty.lt(0)) {
    throw new Error('Display quantity must be a non-negative finite number');
  }
  if (!factor.isFinite() || factor.lte(0)) {
    throw new Error('Conversion factor must be greater than zero');
  }

  return qty
    .times(factor)
    .toDecimalPlaces(QTY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(QTY_DECIMAL_PLACES);
}

export function convertFromBaseQuantity(
  qtyBase: string | number,
  conversionFactorToBase: string | number,
): string {
  const qty = new Decimal(typeof qtyBase === 'number' ? qtyBase : normalizeNumericInput(qtyBase));
  const factor = new Decimal(
    typeof conversionFactorToBase === 'number'
      ? conversionFactorToBase
      : normalizeNumericInput(conversionFactorToBase),
  );

  if (!qty.isFinite() || qty.lt(0)) {
    throw new Error('Base quantity must be a non-negative finite number');
  }
  if (!factor.isFinite() || factor.lte(0)) {
    throw new Error('Conversion factor must be greater than zero');
  }

  return qty
    .dividedBy(factor)
    .toDecimalPlaces(QTY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(QTY_DECIMAL_PLACES);
}

function parseQtyDecimal(value: string | number): Decimal {
  const dec = new Decimal(typeof value === 'number' ? value : normalizeNumericInput(value));
  if (!dec.isFinite()) {
    throw new Error('Quantity must be a finite number');
  }
  return dec;
}

export function addQuantities(a: string | number, b: string | number): string {
  return parseQtyDecimal(a)
    .plus(parseQtyDecimal(b))
    .toDecimalPlaces(QTY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(QTY_DECIMAL_PLACES);
}

export function subtractQuantities(a: string | number, b: string | number): string {
  return parseQtyDecimal(a)
    .minus(parseQtyDecimal(b))
    .toDecimalPlaces(QTY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(QTY_DECIMAL_PLACES);
}

export function compareQuantities(a: string | number, b: string | number): -1 | 0 | 1 {
  const cmp = parseQtyDecimal(a).comparedTo(parseQtyDecimal(b));
  if (cmp < 0) return -1;
  if (cmp > 0) return 1;
  return 0;
}

export function formatQuantityDisplay(qty: string | number, maxDecimals = 3): string {
  const dec = parseQtyDecimal(qty).toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_UP);
  const fixed = dec.toFixed(maxDecimals);
  if (!fixed.includes('.')) {
    return fixed;
  }
  return fixed.replace(/\.?0+$/, '');
}
