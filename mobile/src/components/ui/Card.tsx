import React from 'react';
import { View, type ViewProps } from 'react-native';
import { Colors, Layout } from '@/theme/tokens';

export interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ padded = true, style, children, ...rest }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: Colors.surface,
          borderRadius: Layout.cardRadius,
          borderWidth: 1,
          borderColor: Colors.border,
          padding: padded ? 16 : 0,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
