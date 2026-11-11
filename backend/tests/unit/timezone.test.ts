import { describe, expect, it } from 'vitest';
import { formatDhakaYmd, getDhakaDayRangeUtc } from '../../src/shared/utils/timezone.js';

describe('Asia/Dhaka timezone boundaries', () => {
  it('computes exact UTC bounds for a Bangladesh calendar day (UTC+06:00)', () => {
    const { startUtc, endUtc } = getDhakaDayRangeUtc('2026-11-12');
    expect(startUtc.toISOString()).toBe('2026-11-11T18:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-11-12T17:59:59.999Z');
  });

  it('rejects invalid calendar dates like Feb 30', () => {
    expect(() => getDhakaDayRangeUtc('2026-02-30')).toThrow();
  });

  it('formats UTC timestamps into Asia/Dhaka YYYY-MM-DD', () => {
    // 2026-11-11T20:00:00Z is 2026-11-12 02:00:00 +06:00 in Dhaka
    expect(formatDhakaYmd(new Date('2026-11-11T20:00:00.000Z'))).toBe('2026-11-12');
  });
});
