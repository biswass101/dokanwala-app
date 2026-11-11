import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors } from '@/theme/tokens';

export interface OwnerOnlyScreenProps {
  title: string;
  description: string;
}

export function OwnerOnlyScreen({ title, description }: OwnerOnlyScreenProps) {
  const { t } = useAppTranslation();
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {title}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>
      <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', gap: 8 }}>
        <AppText variant="body" weight="bold" color={Colors.warning}>
          {t('errors.FORBIDDEN_ROLE')}
        </AppText>
        <AppText variant="body" color={Colors.textSecondary}>
          {description}
        </AppText>
      </Card>
    </ScreenContainer>
  );
}
