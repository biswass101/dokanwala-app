import React from 'react';
import { View } from 'react-native';
import { Colors } from '@/theme/tokens';
import { AppText } from './AppText';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const TONE_MAP: Record<BadgeTone, { bg: string; text: string }> = {
  primary: { bg: Colors.primarySoft, text: Colors.primaryPressed },
  success: { bg: Colors.successSoft, text: Colors.success },
  warning: { bg: Colors.warningSoft, text: Colors.warning },
  danger: { bg: Colors.dangerSoft, text: Colors.danger },
  neutral: { bg: '#E2E8F0', text: Colors.textSecondary },
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const colors = TONE_MAP[tone];
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <AppText variant="caption" weight="semibold" color={colors.text}>
        {label}
      </AppText>
    </View>
  );
}
