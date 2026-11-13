import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { AppText, Button, ScreenContainer, SyncStatusPill } from '@/components';
import { QuickSaleForm } from '@/features/sales/components/QuickSaleForm';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function QuickSaleScreen() {
  const { t } = useAppTranslation();
  const router = useRouter();

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="screenTitle" weight="bold">
            {t('pos.quickSaleTitle', { defaultValue: 'সরাসরি বিক্রি' })}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Button
            label={t('pos.historyButton', { defaultValue: 'রসিদ তালিকা' })}
            variant="outline"
            onPress={() => router.push('/sales/history')}
          />
        </View>
      </View>

      <QuickSaleForm />
    </ScreenContainer>
  );
}

