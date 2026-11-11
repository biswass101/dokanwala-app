import React from 'react';
import { EmptyState, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function MorePlaceholderScreen() {
  const { t } = useAppTranslation();
  return (
    <ScreenContainer>
      <EmptyState
        icon="grid-outline"
        badgeText={t('common.phaseBadge')}
        title={t('placeholders.moreTitle')}
        description={t('placeholders.moreDesc')}
      />
    </ScreenContainer>
  );
}
