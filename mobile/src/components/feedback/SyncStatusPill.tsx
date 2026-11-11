import React from 'react';
import { View } from 'react-native';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { usePreferencesStore } from '@/store/preferences.store';
import { Colors } from '@/theme/tokens';
import { AppText } from '../ui/AppText';

export function SyncStatusPill() {
  const { t } = useAppTranslation();
  const { formatDigits } = useFormattedMoney();
  const syncIndicator = usePreferencesStore((state) => state.syncIndicator);
  const pendingSyncCount = usePreferencesStore((state) => state.pendingSyncCount);

  const countFormatted = formatDigits(pendingSyncCount);

  const config = {
    synced: {
      bg: Colors.successSoft,
      dot: Colors.success,
      text: Colors.success,
      label: t('sync.synced'),
    },
    pending: {
      bg: Colors.warningSoft,
      dot: Colors.warning,
      text: Colors.warning,
      label: t('sync.pending', { count: countFormatted }),
    },
    syncing: {
      bg: Colors.primarySoft,
      dot: Colors.primary,
      text: Colors.primaryPressed,
      label: t('sync.syncing'),
    },
    conflict: {
      bg: Colors.dangerSoft,
      dot: Colors.danger,
      text: Colors.danger,
      label: t('sync.conflict', { count: countFormatted }),
    },
  }[syncIndicator];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: config.bg,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        gap: 6,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: config.dot,
        }}
      />
      <AppText variant="caption" weight="semibold" color={config.text}>
        {config.label}
      </AppText>
    </View>
  );
}
