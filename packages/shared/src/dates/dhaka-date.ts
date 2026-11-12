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

export function getDhakaYmd(input: string | Date = new Date()): string {
  const shifted = toShiftedDhakaDate(input);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}

export function shiftDhakaYmd(baseYmd: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseYmd);
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD string: ${baseYmd}`);
  }
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays);
  const shifted = new Date(utc);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}

export function getDhakaMonthStartYmd(baseYmd: string = getDhakaYmd()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseYmd);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid YYYY-MM-DD string: ${baseYmd}`);
  }
  return `${match[1]}-${match[2]}-01`;
}

export function getDhakaWeekStartYmd(baseYmd: string = getDhakaYmd()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseYmd);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid YYYY-MM-DD string: ${baseYmd}`);
  }
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const dow = new Date(utc).getUTCDay(); // 0=Sun..6=Sat
  // Bangladesh retail week starts on Saturday (Sat=0, Sun=1, ..., Fri=6)
  const offsetFromSat = (dow + 1) % 7;
  return shiftDhakaYmd(baseYmd, -offsetFromSat);
}

export function getDhakaMonthKey(baseYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseYmd);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid YYYY-MM-DD string: ${baseYmd}`);
  }
  return `${match[1]}-${match[2]}`;
}

export function formatDhakaMonthLabel(
  monthYm: string,
  language: LanguageCode = 'bn',
  digitStyle: DigitStyle = 'bn',
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthYm);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid YYYY-MM string: ${monthYm}`);
  }
  const monthIdx = Number(match[2]) - 1;
  const monthName =
    language === 'bn' ? (BANGLA_MONTHS[monthIdx] ?? '') : (ENGLISH_MONTHS[monthIdx] ?? '');
  const raw = `${monthName} ${match[1]}`;
  return digitStyle === 'bn' ? toBanglaDigits(raw) : raw;
}
