import type { DigitStyle, LanguageCode } from '../constants/domain.js';
import { toBanglaDigits } from '../money/format-bdt.js';

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

const BANGLA_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
] as const;

const ENGLISH_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function resolveBanglaPeriod(hour24: number): string {
  if (hour24 >= 4 && hour24 < 12) return 'সকাল';
  if (hour24 >= 12 && hour24 < 15) return 'দুপুর';
  if (hour24 >= 15 && hour24 < 18) return 'বিকাল';
  if (hour24 >= 18 && hour24 < 20) return 'সন্ধ্যা';
  return 'রাত';
}

function toShiftedDhakaDate(input: string | Date): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date provided for Dhaka formatting');
  }
  return new Date(date.getTime() + DHAKA_OFFSET_MS);
}

export function formatDhakaDate(
  input: string | Date,
  language: LanguageCode = 'bn',
  digitStyle: DigitStyle = 'bn',
): string {
  const shifted = toShiftedDhakaDate(input);
  const day = shifted.getUTCDate();
  const monthIdx = shifted.getUTCMonth();
  const year = shifted.getUTCFullYear();

  const monthName =
    language === 'bn' ? (BANGLA_MONTHS[monthIdx] ?? '') : (ENGLISH_MONTHS[monthIdx] ?? '');

  const rawDate =
    language === 'bn'
      ? `${String(day)} ${monthName} ${String(year)}`
      : `${String(day).padStart(2, '0')} ${monthName} ${String(year)}`;

  return digitStyle === 'bn' ? toBanglaDigits(rawDate) : rawDate;
}

export function formatDhakaDateTime(
  input: string | Date,
  language: LanguageCode = 'bn',
  digitStyle: DigitStyle = 'bn',
): string {
  const shifted = toShiftedDhakaDate(input);
  const dateStr = formatDhakaDate(input, language, digitStyle);

  const hour24 = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const timeNumeric = `${String(hour12)}:${String(minute).padStart(2, '0')}`;
  const localizedTime = digitStyle === 'bn' ? toBanglaDigits(timeNumeric) : timeNumeric;

  if (language === 'bn') {
    const period = resolveBanglaPeriod(hour24);
    return `${dateStr}, ${period} ${localizedTime}`;
  }

  const amPm = hour24 < 12 ? 'AM' : 'PM';
  return `${dateStr}, ${localizedTime} ${amPm}`;
}
