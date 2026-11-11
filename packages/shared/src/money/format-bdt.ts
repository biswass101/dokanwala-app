import { BDT_CURRENCY_SYMBOL, type DigitStyle } from '../constants/domain.js';
import { poishaToBdtString } from './poisha.js';

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function toBanglaDigits(value: string): string {
  return value.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit);
}

export function toEnglishDigits(value: string): string {
  return value.replace(/[০-৯]/g, (char) => {
    const code = char.charCodeAt(0) - 0x09e6;
    return code >= 0 && code <= 9 ? String(code) : char;
  });
}

/**
 * Applies South Asian lakh/crore grouping (e.g. 1250000 -> "12,50,000") deterministically
 * without relying on device ICU/Hermes Intl quirks.
 */
export function formatSouthAsianInteger(integerStr: string): string {
  if (integerStr.length <= 3) {
    return integerStr;
  }
  const lastThree = integerStr.slice(-3);
  const rest = integerStr.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${groupedRest},${lastThree}`;
}

export interface FormatBdtOptions {
  digitStyle?: DigitStyle;
  showDecimals?: boolean;
  trimTrailingZeroDecimals?: boolean;
  includeSymbol?: boolean;
}

export function formatBdt(poisha: number, options: FormatBdtOptions = {}): string {
  const {
    digitStyle = 'bn',
    showDecimals = true,
    trimTrailingZeroDecimals = true,
    includeSymbol = true,
  } = options;

  const isNegative = poisha < 0;
  const absPoisha = Math.abs(poisha);
  const rawDecimal = poishaToBdtString(absPoisha, 2);
  const [intPart = '0', fracPart = '00'] = rawDecimal.split('.');

  const groupedInt = formatSouthAsianInteger(intPart);
  const includeFrac = showDecimals && !(trimTrailingZeroDecimals && fracPart === '00');
  const numericBody = includeFrac ? `${groupedInt}.${fracPart}` : groupedInt;
  const localizedBody = digitStyle === 'bn' ? toBanglaDigits(numericBody) : numericBody;

  const sign = isNegative ? '-' : '';
  return includeSymbol ? `${sign}${BDT_CURRENCY_SYMBOL} ${localizedBody}` : `${sign}${localizedBody}`;
}
