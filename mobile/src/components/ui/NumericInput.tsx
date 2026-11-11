import { normalizeNumericInput } from '@dokanwala/shared';
import React from 'react';
import { Input, type InputProps } from './Input';

export interface NumericInputProps extends Omit<InputProps, 'onChangeText' | 'keyboardType'> {
  value: string;
  onChangeNormalized: (normalizedAscii: string, rawDisplay: string) => void;
}

/**
 * Bangla-keyboard-friendly numeric input: accepts both '০-৯' and '0-9'
 * and provides deterministic normalized ASCII numbers to domain forms.
 */
export function NumericInput({ value, onChangeNormalized, ...rest }: NumericInputProps) {
  const handleChangeText = (rawText: string) => {
    const normalized = normalizeNumericInput(rawText);
    onChangeNormalized(normalized, rawText);
  };

  return (
    <Input
      value={value}
      onChangeText={handleChangeText}
      keyboardType="decimal-pad"
      autoCorrect={false}
      {...rest}
    />
  );
}
