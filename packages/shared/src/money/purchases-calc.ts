import { Decimal } from 'decimal.js';
import { POISHA_PER_BDT } from '../constants/domain.js';
import { convertToBaseQuantity } from '../units/conversion.js';
import { normalizeNumericInput } from '../validation/bangla-input.js';
import { calculateLineTotalPoisha, calculateMovingWacBdt } from './poisha.js';

const UNIT_COST_DECIMAL_PLACES = 6;

/**
 * Proportionally allocates an invoice-level purchase discount across lines so that
 * `sum(effectiveNetCosts) === sum(lineTotalsPoisha) - discountPoisha` exactly.
 */
export function allocatePurchaseNetCostsPoisha(
  lineTotalsPoisha: readonly number[],
  discountPoisha: number,
): number[] {
  if (!Number.isSafeInteger(discountPoisha) || discountPoisha < 0) {
    throw new Error('Purchase discount must be a non-negative integer in poisha');
  }
  const subtotal = lineTotalsPoisha.reduce((acc, v) => acc + v, 0);
  if (discountPoisha > subtotal) {
    throw new Error('Purchase discount cannot exceed purchase subtotal');
  }
  if (lineTotalsPoisha.length === 0) {
    return [];
  }
  if (discountPoisha === 0 || subtotal === 0) {
    return [...lineTotalsPoisha];
  }

  let allocatedDiscount = 0;
  const netCosts: number[] = [];

  for (let i = 0; i < lineTotalsPoisha.length; i += 1) {
    const lineTotal = lineTotalsPoisha[i] ?? 0;
    const isLast = i === lineTotalsPoisha.length - 1;
    const lineDiscount = isLast
      ? discountPoisha - allocatedDiscount
      : new Decimal(discountPoisha)
          .times(lineTotal)
          .dividedBy(subtotal)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();

    const clampedDiscount = Math.min(lineTotal, Math.max(0, lineDiscount));
    allocatedDiscount += clampedDiscount;
    netCosts.push(lineTotal - clampedDiscount);
  }

  return netCosts;
}

/**
 * Computes base-unit purchase price in integer poisha for Product.lastPurchasePricePoisha.
 */
export function calculateBaseUnitPurchaseCostPoisha(
  unitCostPoisha: number,
  conversionFactorToBase: string | number,
): number {
  if (!Number.isSafeInteger(unitCostPoisha) || unitCostPoisha < 0) {
    throw new Error('Unit cost in poisha must be a non-negative safe integer');
  }
  const factor = new Decimal(
    typeof conversionFactorToBase === 'number'
      ? conversionFactorToBase
      : normalizeNumericInput(conversionFactorToBase),
  );
  if (!factor.isFinite() || factor.lte(0)) {
    throw new Error('Conversion factor must be positive');
  }

  return new Decimal(unitCostPoisha)
    .dividedBy(factor)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Computes suggested unit purchase cost in poisha when selecting a purchase unit in UI.
 * Avoids requiring decimal.js directly inside mobile/src.
 */
export function calculateExpectedUnitPurchaseCostPoisha(params: {
  avgCostPerBaseBdt: string | null;
  lastPurchasePricePoisha: number | null;
  conversionFactorToBase: string | number;
}): number {
  const factor = new Decimal(
    typeof params.conversionFactorToBase === 'number'
      ? params.conversionFactorToBase
      : normalizeNumericInput(params.conversionFactorToBase) || '1',
  );
  if (!factor.isFinite() || factor.lte(0)) {
    return 0;
  }

  if (params.avgCostPerBaseBdt !== null) {
    const avgDec = new Decimal(params.avgCostPerBaseBdt);
    if (avgDec.isFinite() && avgDec.gt(0)) {
      return avgDec
        .times(POISHA_PER_BDT)
        .times(factor)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();
    }
  }

  if (params.lastPurchasePricePoisha !== null && params.lastPurchasePricePoisha > 0) {
    return new Decimal(params.lastPurchasePricePoisha)
      .times(factor)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  return 0;
}

/**
 * Computes proportional reversed inventory cost for a purchase return line, guaranteeing exact remaining settle on full item return.
 */
export function calculateProportionalCostReversedPoisha(params: {
  itemNetCostPoisha: number;
  itemQtyBase: string | number;
  returnQtyBase: string | number;
  alreadyReversedCostPoisha: number;
  isCompletingItem: boolean;
}): number {
  const remainingCost = Math.max(0, params.itemNetCostPoisha - params.alreadyReversedCostPoisha);
  if (remainingCost === 0) {
    return 0;
  }
  if (params.isCompletingItem) {
    return remainingCost;
  }
  const itemQtyDec = new Decimal(params.itemQtyBase);
  const returnQtyDec = new Decimal(params.returnQtyBase);
  if (itemQtyDec.lte(0) || returnQtyDec.lte(0)) {
    return 0;
  }
  const proportional = new Decimal(params.itemNetCostPoisha)
    .times(returnQtyDec)
    .dividedBy(itemQtyDec)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return Math.min(remainingCost, Math.max(0, proportional));
}

/**
 * Reverses inventory value from Moving WAC upon returning goods to a supplier.
 */
export function calculatePurchaseReturnWacBdt(params: {
  currentQtyBase: string | number;
  currentAvgCostBdt: string | number;
  returnQtyBase: string | number;
  reversedCostPoisha: number;
}): string {
  const currentQty = new Decimal(params.currentQtyBase);
  const currentAvg = new Decimal(params.currentAvgCostBdt);
  const returnQty = new Decimal(params.returnQtyBase);
  const nextQty = currentQty.minus(returnQty);

  if (nextQty.lte(0)) {
    return '0.000000';
  }

  const currentValueBdt = currentQty.times(currentAvg);
  const reversedValueBdt = new Decimal(params.reversedCostPoisha).dividedBy(POISHA_PER_BDT);
  const nextValueBdt = currentValueBdt.minus(reversedValueBdt);

  if (nextValueBdt.lte(0)) {
    return currentAvg.isPositive()
      ? currentAvg
          .toDecimalPlaces(UNIT_COST_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
          .toFixed(UNIT_COST_DECIMAL_PLACES)
      : '0.000000';
  }

  return nextValueBdt
    .dividedBy(nextQty)
    .toDecimalPlaces(UNIT_COST_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(UNIT_COST_DECIMAL_PLACES);
}

/**
 * Pure preview helper for UI: computes incoming base qty, line total, resulting stock, and projected Moving WAC.
 */
export function previewPurchaseItemImpact(params: {
  currentQtyBase: string;
  currentAvgCostBdt: string;
  qtyDisplay: string;
  conversionFactorToBase: string;
  unitCostPoisha: number;
}): {
  qtyBase: string;
  lineTotalPoisha: number;
  nextQtyBase: string;
  nextAvgCostBdt: string;
} {
  const qtyBase = convertToBaseQuantity(params.qtyDisplay, params.conversionFactorToBase);
  const lineTotalPoisha = calculateLineTotalPoisha(params.qtyDisplay, params.unitCostPoisha);
  const nextQtyBase = new Decimal(params.currentQtyBase)
    .plus(qtyBase)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    .toFixed(4);
  const nextAvgCostBdt = calculateMovingWacBdt({
    oldQtyBase: params.currentQtyBase,
    oldAvgCostBdt: params.currentAvgCostBdt,
    incomingQtyBase: qtyBase,
    incomingTotalCostPoisha: lineTotalPoisha,
  });
  return {
    qtyBase,
    lineTotalPoisha,
    nextQtyBase,
    nextAvgCostBdt,
  };
}
