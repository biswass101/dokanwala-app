import { Decimal } from 'decimal.js';
import { POISHA_PER_BDT } from '../constants/domain.js';
import { normalizeNumericInput } from '../validation/bangla-input.js';

const MONEY_DECIMAL_PLACES = 2;
const UNIT_COST_DECIMAL_PLACES = 6;

function toDecimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) {
    if (!value.isFinite()) {
      throw new Error('Monetary calculation received non-finite Decimal');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Monetary calculation received non-finite number');
    }
    return new Decimal(value);
  }

  const normalized = normalizeNumericInput(value);
  if (normalized.length === 0) {
    throw new Error('Monetary string cannot be empty');
  }
  const parsed = new Decimal(normalized);
  if (!parsed.isFinite()) {
    throw new Error(`Invalid monetary value: ${value}`);
  }
  return parsed;
}

function assertSafePoisha(poisha: number): number {
  if (!Number.isSafeInteger(poisha)) {
    throw new Error(`Invalid poisha integer: ${String(poisha)}`);
  }
  return poisha;
}

/**
 * Converts a BDT decimal input (supports Bangla digits e.g. "১২৫.৫০") into integer poisha.
 */
export function bdtToPoisha(bdtInput: string | number | Decimal): number {
  const decimalValue = toDecimal(bdtInput);
  const poisha = decimalValue
    .times(POISHA_PER_BDT)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return assertSafePoisha(poisha);
}

/**
 * Formats integer poisha as a plain ASCII decimal string (e.g. 12550 -> "125.50").
 */
export function poishaToBdtString(poisha: number, decimals = MONEY_DECIMAL_PLACES): string {
  assertSafePoisha(poisha);
  return new Decimal(poisha).dividedBy(POISHA_PER_BDT).toFixed(decimals);
}

export function addPoisha(...amounts: number[]): number {
  let total = 0;
  for (const amount of amounts) {
    assertSafePoisha(amount);
    total += amount;
    assertSafePoisha(total);
  }
  return total;
}

export function subtractPoisha(a: number, b: number): number {
  assertSafePoisha(a);
  assertSafePoisha(b);
  return assertSafePoisha(a - b);
}

/**
 * Calculates integer poisha line subtotal = roundHalfUp(qty * unitPricePoisha).
 */
export function calculateLineTotalPoisha(
  quantity: string | number | Decimal,
  unitPricePoisha: number,
): number {
  assertSafePoisha(unitPricePoisha);
  const qtyDec = toDecimal(quantity);
  if (qtyDec.isNegative()) {
    throw new Error('Quantity cannot be negative');
  }
  const result = qtyDec
    .times(unitPricePoisha)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return assertSafePoisha(result);
}

/**
 * Calculates integer poisha COGS = roundHalfUp(qtyBase * avgCostPerBaseBdt * 100).
 */
export function calculateLineCogsPoisha(
  qtyBase: string | number | Decimal,
  avgCostPerBaseBdt: string | number | Decimal,
): number {
  const qtyDec = toDecimal(qtyBase);
  const avgCostDec = toDecimal(avgCostPerBaseBdt);
  if (qtyDec.isNegative() || avgCostDec.isNegative()) {
    throw new Error('COGS operands cannot be negative');
  }
  const result = qtyDec
    .times(avgCostDec)
    .times(POISHA_PER_BDT)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return assertSafePoisha(result);
}

/**
 * Calculates current inventory valuation in poisha from remaining stock and WAC.
 * Returns 0 when stock balance is zero or negative.
 */
export function calculateInventoryValuationPoisha(
  qtyBase: string | number | Decimal,
  avgCostPerBaseBdt: string | number | Decimal,
): number {
  const qtyDec = toDecimal(qtyBase);
  const avgCostDec = toDecimal(avgCostPerBaseBdt);
  if (qtyDec.lte(0) || avgCostDec.lte(0)) {
    return 0;
  }
  const result = qtyDec
    .times(avgCostDec)
    .times(POISHA_PER_BDT)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return assertSafePoisha(result);
}

/**
 * Calculates Moving Weighted-Average Cost (WAC) per base unit in BDT (6 decimal places).
 */
export function calculateMovingWacBdt(params: {
  oldQtyBase: string | number | Decimal;
  oldAvgCostBdt: string | number | Decimal;
  incomingQtyBase: string | number | Decimal;
  incomingTotalCostPoisha: number;
}): string {
  assertSafePoisha(params.incomingTotalCostPoisha);
  const oldQty = toDecimal(params.oldQtyBase);
  const oldAvgCost = toDecimal(params.oldAvgCostBdt);
  const incomingQty = toDecimal(params.incomingQtyBase);

  if (incomingQty.lte(0)) {
    throw new Error('Incoming purchase quantity must be positive');
  }
  if (params.incomingTotalCostPoisha < 0) {
    throw new Error('Incoming purchase cost cannot be negative');
  }

  const incomingCostBdt = new Decimal(params.incomingTotalCostPoisha).dividedBy(POISHA_PER_BDT);

  if (oldQty.lte(0)) {
    return incomingCostBdt
      .dividedBy(incomingQty)
      .toDecimalPlaces(UNIT_COST_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
      .toFixed(UNIT_COST_DECIMAL_PLACES);
  }

  const previousInventoryBdt = oldQty.times(oldAvgCost);
  const combinedQty = oldQty.plus(incomingQty);
  return previousInventoryBdt
    .plus(incomingCostBdt)
    .dividedBy(combinedQty)
    .toDecimalPlaces(UNIT_COST_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(UNIT_COST_DECIMAL_PLACES);
}
