import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors } from '@/theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useAppTranslation();

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 10,
        backgroundColor: Colors.dangerSoft,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FECACA',
      }}
    >
      <Ionicons name="alert-circle-outline" size={30} color={Colors.danger} />
      <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
        {title ?? t('common.errorTitle')}
      </AppText>
      <AppText
        variant="body"
        color={Colors.textPrimary}
        style={{ textAlign: 'center', maxWidth: 320 }}
      >
        {message ?? t('common.errorFallback')}
      </AppText>
      {onRetry ? (
        <Button label={t('common.retry')} variant="danger" onPress={onRetry} />
      ) : null}
    </View>
  );
}
