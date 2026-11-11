import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { Colors } from '@/theme/tokens';
import { AppText } from '../ui/AppText';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  badgeText?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  description,
  badgeText,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: Colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={28} color={Colors.primary} />
      </View>
      {badgeText ? <Badge label={badgeText} tone="primary" /> : null}
      <AppText variant="sectionTitle" weight="bold" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {description ? (
        <AppText
          variant="body"
          color={Colors.textSecondary}
          style={{ textAlign: 'center', maxWidth: 320 }}
        >
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: 4 }} />
      ) : null}
    </View>
  );
}
