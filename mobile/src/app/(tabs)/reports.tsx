import React from 'react';
import { EmptyState, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function ReportsPlaceholderScreen() {
  const { t } = useAppTranslation();
  return (
    <ScreenContainer>
      <EmptyState
        icon="bar-chart-outline"
        badgeText={t('common.phaseBadge')}
        title={t('placeholders.reportsTitle')}
        description={t('placeholders.reportsDesc')}
      />
    </ScreenContainer>
  );
}
