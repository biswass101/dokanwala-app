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
