import { formatBdt, toBanglaDigits, type FormatBdtOptions } from '@dokanwala/shared';
import { usePreferencesStore } from '@/store/preferences.store';

export function useFormattedMoney() {
  const digitStyle = usePreferencesStore((state) => state.digitStyle);

  const formatMoney = (poisha: number, options?: Omit<FormatBdtOptions, 'digitStyle'>): string =>
    formatBdt(poisha, { ...options, digitStyle });

  const formatDigits = (value: string | number): string => {
    const str = String(value);
    return digitStyle === 'bn' ? toBanglaDigits(str) : str;
  };

  return {
    digitStyle,
    formatMoney,
    formatDigits,
  };
}
