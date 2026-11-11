import React from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Colors, FontFamilies, Layout } from '@/theme/tokens';
import { AppText } from './AppText';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, style, ...rest }: InputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <AppText variant="caption" weight="semibold" color={Colors.textPrimary}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={Colors.textMuted}
        style={[
          {
            minHeight: Layout.minTouchTarget,
            borderRadius: Layout.controlRadius,
            borderWidth: 1,
            borderColor: error ? Colors.danger : Colors.border,
            backgroundColor: Colors.surface,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 16,
            fontFamily: FontFamilies.regular,
            color: Colors.textPrimary,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color={Colors.danger}>
          {error}
        </AppText>
      ) : helperText ? (
        <AppText variant="caption" color={Colors.textSecondary}>
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}
