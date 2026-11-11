import React from 'react';
import { EmptyState, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function SalesPlaceholderScreen() {
  const { t } = useAppTranslation();
  return (
    <ScreenContainer>
      <EmptyState
        icon="cart-outline"
        badgeText={t('common.phaseBadge')}
        title={t('placeholders.salesTitle')}
        description={t('placeholders.salesDesc')}
      />
    </ScreenContainer>
  );
}
