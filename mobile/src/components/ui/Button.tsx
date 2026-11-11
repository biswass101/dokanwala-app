import React from 'react';
import { ActivityIndicator, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { Colors, Layout } from '@/theme/tokens';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  { bg: string; pressedBg: string; border: string; textColor: string }
> = {
  primary: {
    bg: Colors.primary,
    pressedBg: Colors.primaryPressed,
    border: Colors.primary,
    textColor: Colors.white,
  },
  secondary: {
    bg: Colors.primarySoft,
    pressedBg: '#99F6E4',
    border: Colors.primarySoft,
    textColor: Colors.primaryPressed,
  },
  outline: {
    bg: Colors.surface,
    pressedBg: Colors.background,
    border: Colors.border,
    textColor: Colors.textPrimary,
  },
  danger: {
    bg: Colors.danger,
    pressedBg: '#991B1B',
    border: Colors.danger,
    textColor: Colors.white,
  },
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...rest
}: ButtonProps) {
  const palette = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          minHeight: Layout.minTouchTarget,
          borderRadius: Layout.controlRadius,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: pressed ? palette.pressedBg : palette.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDisabled ? 0.6 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
          gap: 8,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator size="small" color={palette.textColor} /> : null}
      <AppText variant="body" weight="semibold" color={palette.textColor}>
        {label}
      </AppText>
    </Pressable>
  );
}
