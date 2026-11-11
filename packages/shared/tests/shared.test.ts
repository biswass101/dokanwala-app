import { describe, expect, it } from 'vitest';
import {
  addPoisha,
  addQuantities,
  allocatePurchaseNetCostsPoisha,
  bdtToPoisha,
  calculateBaseUnitPurchaseCostPoisha,
  calculateDiscountPoisha,
  calculateExpectedUnitPurchaseCostPoisha,
  calculateInventoryValuationPoisha,
  calculateLineCogsPoisha,
  calculateLineTotalPoisha,
  calculateMovingWacBdt,
  calculateProportionalCostReversedPoisha,
  calculateProportionalReturnDiscount,
  calculatePurchaseReturnWacBdt,
  compareQuantities,
  convertFromBaseQuantity,
  convertToBaseQuantity,
  doesDiscountExceedPercentCap,
  formatBdt,
  formatDhakaDate,
  formatDhakaDateTime,
  formatQuantityDisplay,
  normalizeBdPhone,
  normalizeNumericInput,
  normalizeUnicodeText,
  poishaToBdtString,
  previewPurchaseItemImpact,
  subtractPoisha,
  subtractQuantities,
  toBanglaDigits,
  toEnglishDigits,
} from '../src/index.js';

describe('poisha financial arithmetic', () => {
  it('avoids IEEE-754 floating point drift', () => {
    const a = bdtToPoisha('0.10');
    const b = bdtToPoisha('0.20');
    expect(addPoisha(a, b)).toBe(30);
    expect(poishaToBdtString(addPoisha(a, b))).toBe('0.30');
    expect(subtractPoisha(bdtToPoisha('100.00'), bdtToPoisha('33.33'))).toBe(6667);
  });

  it('parses Bangla digits cleanly into poisha', () => {
    expect(bdtToPoisha('১২৫.৫০')).toBe(12550);
    expect(bdtToPoisha('১,২৫০')).toBe(125000);
  });

  it('calculates fractional Supari weighted-average cost and COGS accurately', () => {
    // Buy 5 kg (5000 g) Supari for 4275 BDT = 427500 poisha -> 0.855000 BDT/gram
    const wac = calculateMovingWacBdt({
      oldQtyBase: '0',
      oldAvgCostBdt: '0',
      incomingQtyBase: '5000',
      incomingTotalCostPoisha: 427500,
    });
    expect(wac).toBe('0.855000');

    // Sell 250 grams: COGS = 250 * 0.855 * 100 = 21375 poisha (213.75 BDT)
    expect(calculateLineCogsPoisha('250', wac)).toBe(21375);

    // Restock 5000 grams at 900 BDT/kg (450000 poisha) -> average (4275 + 4500) / 10000 = 0.877500
    const nextWac = calculateMovingWacBdt({
      oldQtyBase: '5000',
      oldAvgCostBdt: wac,
      incomingQtyBase: '5000',
      incomingTotalCostPoisha: 450000,
    });
    expect(nextWac).toBe('0.877500');
  });

  it('calculates line totals with half-up rounding', () => {
    expect(calculateLineTotalPoisha('1.5', 3500)).toBe(5250);
    expect(calculateLineTotalPoisha('০.২৫', 110000)).toBe(27500);
  });
});

describe('Bangla formatting & input normalization', () => {
  it('formats South Asian lakh/crore grouping in Bangla and English digits', () => {
    expect(formatBdt(12500000, { digitStyle: 'bn' })).toBe('৳ ১,২৫,০০০');
    expect(formatBdt(125050, { digitStyle: 'bn' })).toBe('৳ ১,২৫০.৫০');
    expect(formatBdt(125050, { digitStyle: 'en' })).toBe('৳ 1,250.50');
    expect(formatBdt(-5000, { digitStyle: 'bn' })).toBe('-৳ ৫০');
  });

  it('normalizes Bangla keyboard numeric inputs and Unicode NFC text', () => {
    expect(toBanglaDigits('2026')).toBe('২০২৬');
    expect(toEnglishDigits('২৫০')).toBe('250');
    expect(normalizeNumericInput(' ১২,৫০।৭৫ ')).toBe('1250.75');
    expect(normalizeNumericInput('.৫')).toBe('0.5');
    // Decomposed য + ় vs NFC য়
    expect(normalizeUnicodeText('য\u09bc')).toBe('য়');
  });

  it('normalizes Bangladeshi phone numbers including Bangla digits', () => {
    expect(normalizeBdPhone('০১৭১১-২২৩৩৪৪')).toBe('+8801711223344');
    expect(normalizeBdPhone('8801812345678')).toBe('+8801812345678');
    expect(normalizeBdPhone('01234567890')).toBeNull();
  });
});

describe('Unit conversions', () => {
  it('converts between Pan bira/piece and Supari kg/gram accurately', () => {
    expect(convertToBaseQuantity('2.5', '20')).toBe('50.0000');
    expect(convertFromBaseQuantity('50', '20')).toBe('2.5000');
    expect(convertToBaseQuantity('০.২৫', '1000')).toBe('250.0000');
    expect(addQuantities('0.1', '0.2')).toBe('0.3000');
    expect(subtractQuantities('500', '125.5')).toBe('374.5000');
    expect(compareQuantities('120.0000', '120')).toBe(0);
    expect(formatQuantityDisplay('25.5000')).toBe('25.5');
    expect(calculateInventoryValuationPoisha('250', '0.855000')).toBe(21375);
    expect(calculateInventoryValuationPoisha('-5', '10.000000')).toBe(0);
  });
});

describe('POS discount & Dhaka date helpers', () => {
  it('computes fixed and percentage discounts in poisha accurately', () => {
    expect(calculateDiscountPoisha(50000, 'FIXED_POISHA', 2500)).toBe(2500);
    expect(calculateDiscountPoisha(50000, 'PERCENT', '১০')).toBe(5000);
    expect(calculateDiscountPoisha(3333, 'PERCENT', 10)).toBe(333);

    // Proportional return discount guarantees cumulative discount settles cleanly
    const firstPartDiscount = calculateProportionalReturnDiscount({
      returnSubtotalPoisha: 10000,
      saleSubtotalPoisha: 30000,
      totalDiscountPoisha: 1000,
      alreadyDiscountAdjustedPoisha: 0,
      isFullRemainingReturn: false,
    });
    expect(firstPartDiscount).toBe(333);

    const finalPartDiscount = calculateProportionalReturnDiscount({
      returnSubtotalPoisha: 20000,
      saleSubtotalPoisha: 30000,
      totalDiscountPoisha: 1000,
      alreadyDiscountAdjustedPoisha: firstPartDiscount,
      isFullRemainingReturn: true,
    });
    expect(firstPartDiscount + finalPartDiscount).toBe(1000);

    expect(doesDiscountExceedPercentCap(10000, 1000, 10)).toBe(false);
    expect(doesDiscountExceedPercentCap(10000, 1001, 10)).toBe(true);
    expect(doesDiscountExceedPercentCap(0, 0, 10)).toBe(false);
  });

  it('formats UTC instants cleanly in Asia/Dhaka with Bangla and English styles', () => {
    // 2026-11-12T09:30:00.000Z => 2026-11-12 15:30 BST (বিকাল ৩:৩০)
    const iso = '2026-11-12T09:30:00.000Z';
    expect(formatDhakaDate(iso, 'bn', 'bn')).toBe('১২ নভেম্বর ২০২৬');
    expect(formatDhakaDateTime(iso, 'bn', 'bn')).toBe('১২ নভেম্বর ২০২৬, বিকাল ৩:৩০');
    expect(formatDhakaDateTime(iso, 'en', 'en')).toBe('12 Nov 2026, 3:30 PM');
  });
});

describe('Purchase & Moving WAC reversal helpers', () => {
  it('allocates invoice-level purchase discount cleanly with exact penny reconciliation', () => {
    const netCosts = allocatePurchaseNetCostsPoisha([25000, 427500], 2500);
    expect(netCosts.reduce((a, b) => a + b, 0)).toBe(450000);
    expect(netCosts[0]).toBe(24862);
    expect(netCosts[1]).toBe(425138);
  });

  it('computes base-unit purchase price and unit suggestion cost cleanly', () => {
    expect(calculateBaseUnitPurchaseCostPoisha(2500, '20')).toBe(125);
    expect(calculateBaseUnitPurchaseCostPoisha(85500, '1000')).toBe(86);
    expect(
      calculateExpectedUnitPurchaseCostPoisha({
        avgCostPerBaseBdt: '0.855000',
        lastPurchasePricePoisha: 86,
        conversionFactorToBase: '1000',
      }),
    ).toBe(85500);
  });

  it('previews incoming purchase impact and reverses WAC cleanly on supplier returns', () => {
    const preview = previewPurchaseItemImpact({
      currentQtyBase: '100.0000',
      currentAvgCostBdt: '1.000000',
      qtyDisplay: '5',
      conversionFactorToBase: '20',
      unitCostPoisha: 4000, // 40 BDT per 20 pcs = 2 BDT/pc
    });
    expect(preview.qtyBase).toBe('100.0000');
    expect(preview.lineTotalPoisha).toBe(20000);
    expect(preview.nextQtyBase).toBe('200.0000');
    expect(preview.nextAvgCostBdt).toBe('1.500000');

    const reversedCost = calculateProportionalCostReversedPoisha({
      itemNetCostPoisha: 20000,
      itemQtyBase: '100.0000',
      returnQtyBase: '100.0000',
      alreadyReversedCostPoisha: 0,
      isCompletingItem: true,
    });
    expect(reversedCost).toBe(20000);

    // Returning batch 2 restores exact batch 1 WAC (1.000000)
    const afterReturnWac = calculatePurchaseReturnWacBdt({
      currentQtyBase: '200.0000',
      currentAvgCostBdt: '1.500000',
      returnQtyBase: '100.0000',
      reversedCostPoisha: reversedCost,
    });
    expect(afterReturnWac).toBe('1.000000');

    // Returning all remaining stock zeroes WAC cleanly
    expect(
      calculatePurchaseReturnWacBdt({
        currentQtyBase: '100.0000',
        currentAvgCostBdt: '1.000000',
        returnQtyBase: '100.0000',
        reversedCostPoisha: 10000,
      }),
    ).toBe('0.000000');
  });
});
