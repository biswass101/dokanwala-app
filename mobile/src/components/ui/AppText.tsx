import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { Colors, FontFamilies, Typography } from '@/theme/tokens';

export type TextVariant = keyof typeof Typography;
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: string;
}

export function AppText({
  variant = 'body',
  weight = 'regular',
  color = Colors.textPrimary,
  style,
  children,
  ...rest
}: AppTextProps) {
  const typographyStyle = Typography[variant];
  const fontStyle: TextStyle = {
    fontSize: typographyStyle.fontSize,
    lineHeight: typographyStyle.lineHeight,
    fontFamily: FontFamilies[weight],
    color,
  };

  return (
    <Text style={[fontStyle, style]} {...rest}>
      {children}
    </Text>
  );
}
