import { describe, expect, it } from 'vitest';
import {
  addPoisha,
  bdtToPoisha,
  calculateLineCogsPoisha,
  calculateLineTotalPoisha,
  calculateMovingWacBdt,
  convertFromBaseQuantity,
  convertToBaseQuantity,
  formatBdt,
  normalizeBdPhone,
  normalizeNumericInput,
  normalizeUnicodeText,
  poishaToBdtString,
  subtractPoisha,
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
  });
});
