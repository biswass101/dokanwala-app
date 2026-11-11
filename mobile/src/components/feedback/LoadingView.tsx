import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors } from '@/theme/tokens';
import { AppText } from '../ui/AppText';

export interface LoadingViewProps {
  message?: string;
}

export function LoadingView({ message }: LoadingViewProps) {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
      }}
    >
      <ActivityIndicator size="large" color={Colors.primary} />
      <AppText variant="body" color={Colors.textSecondary}>
        {message ?? t('common.loading')}
      </AppText>
    </View>
  );
}
