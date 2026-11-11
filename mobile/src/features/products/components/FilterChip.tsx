import React from 'react';
import { Pressable } from 'react-native';
import { AppText } from '@/components';
import { Colors } from '@/theme/tokens';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  tone?: 'primary' | 'warning' | 'danger';
  onPress: () => void;
}

export function FilterChip({
  label,
  selected,
  tone = 'primary',
  onPress,
}: FilterChipProps) {
  const activeBg =
    tone === 'warning'
      ? Colors.warningSoft
      : tone === 'danger'
        ? Colors.dangerSoft
        : Colors.primarySoft;
  const activeBorder =
    tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
        ? Colors.danger
        : Colors.primary;
  const activeText =
    tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
        ? Colors.danger
        : Colors.primaryPressed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? activeBorder : Colors.border,
        backgroundColor: selected ? activeBg : Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText
        variant="caption"
        weight={selected ? 'bold' : 'medium'}
        color={selected ? activeText : Colors.textSecondary}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
