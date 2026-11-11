import { toEnglishDigits } from '../money/format-bdt.js';

/**
 * Normalizes numeric strings typed with either English or Bangla keyboards (Ridmik/Gboard).
 * Converts '০-৯' -> '0-9', converts Bangla dari '।' -> '.', removes grouping commas/spaces.
 */
export function normalizeNumericInput(raw: string): string {
  const asciiDigits = toEnglishDigits(raw.trim())
    .replace(/।/g, '.')
    .replace(/,/g, '')
    .replace(/\s+/g, '');

  if (asciiDigits.length === 0) {
    return '';
  }

  let hasMinus = false;
  let hasDecimal = false;
  let result = '';

  for (let i = 0; i < asciiDigits.length; i += 1) {
    const ch = asciiDigits[i];
    if (ch === undefined) continue;
    if (ch === '-' && i === 0 && !hasMinus) {
      hasMinus = true;
      result += ch;
    } else if (ch === '.' && !hasDecimal) {
      hasDecimal = true;
      result += result === '' || result === '-' ? '0.' : '.';
    } else if (ch >= '0' && ch <= '9') {
      result += ch;
    }
  }

  return result;
}

/**
 * Normalizes Bangla/Unicode text to NFC form so decomposed characters match consistently.
 */
export function normalizeUnicodeText(raw: string): string {
  return raw.trim().normalize('NFC');
}

/**
 * Normalizes Bangladeshi mobile numbers (including Bangla digits) to E.164 "+8801XXXXXXXXX".
 * Returns null if invalid.
 */
export function normalizeBdPhone(raw: string): string | null {
  const cleaned = toEnglishDigits(raw).replace(/[\s\-()]/g, '');
  const match = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(cleaned);
  if (!match?.[1]) {
    return null;
  }
  return `+88${match[1]}`;
}
