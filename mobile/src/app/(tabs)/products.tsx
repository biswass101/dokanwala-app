import React from 'react';
import { EmptyState, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function ProductsPlaceholderScreen() {
  const { t } = useAppTranslation();
  return (
    <ScreenContainer>
      <EmptyState
        icon="cube-outline"
        badgeText={t('common.phaseBadge')}
        title={t('placeholders.productsTitle')}
        description={t('placeholders.productsDesc')}
      />
    </ScreenContainer>
  );
}
