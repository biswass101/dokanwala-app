import type { StockMovementType } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingView,
  ScreenContainer,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useMovementsQuery,
  useValuationQuery,
} from '@/features/products/hooks/useCatalogQueries';
import {
  formatQuantityWithDigits,
  getLocalizedProductName,
  getLocalizedUnitName,
  getMovementTypeBadge,
} from '@/features/products/utils/catalog-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const MOVEMENT_FILTERS: readonly StockMovementType[] = [
  'OPENING_STOCK',
  'PURCHASE_IN',
  'SALE_OUT',
  'WASTAGE_OUT',
  'DAMAGE_OUT',
  'EXPIRED_OUT',
  'COUNT_ADJUST',
];

export default function InventoryHistoryScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const [selectedType, setSelectedType] = useState<StockMovementType | undefined>(undefined);

  const valuationQuery = useValuationQuery(isOwner);
  const movementsQuery = useMovementsQuery(selectedType ? { type: selectedType } : undefined);

  const valuation = valuationQuery.data?.valuation;
  const movements = movementsQuery.data?.movements ?? [];

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('inventory.historyTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {/* Owner-only Stock Valuation Summary */}
      {isOwner ? (
        valuationQuery.isLoading ? (
          <LoadingView />
        ) : valuationQuery.isError ? (
          <ErrorState
            message={getLocalizedErrorMessage(valuationQuery.error, t)}
            onRetry={() => void valuationQuery.refetch()}
          />
        ) : valuation ? (
          <Card style={{ gap: 12, backgroundColor: Colors.primarySoft, borderColor: '#99F6E4' }}>
            <AppText variant="caption" weight="semibold" color={Colors.primaryPressed}>
              {t('inventory.totalValuation')}
            </AppText>
            <AppText variant="kpiHero" weight="bold" color={Colors.primaryPressed}>
              {formatMoney(valuation.totalValuationPoisha)}
            </AppText>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('inventory.activeProductsCount')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold">
                  {formatDigits(valuation.totalActiveProducts)}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('inventory.lowStockCount')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.warning}>
                  {formatDigits(valuation.lowStockCount)}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('inventory.outOfStockCount')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
                  {formatDigits(valuation.outOfStockCount)}
                </AppText>
              </View>
            </View>
          </Card>
        ) : null
      ) : null}

      {/* Owner-only Valuation Breakdown */}
      {isOwner && valuation && valuation.items.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="sectionTitle" weight="bold">
            {t('inventory.valuationBreakdown')}
          </AppText>
          {valuation.items.slice(0, 10).map((item) => {
            const name = language === 'en' && item.nameEn ? item.nameEn : item.nameBn;
            const unitName =
              language === 'en' ? item.baseUnitNameEn : item.baseUnitNameBn;
            return (
              <View
                key={item.productId}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTopWidth: 1,
                  borderTopColor: Colors.border,
                  paddingTop: 8,
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body" weight="semibold">
                    {name}
                  </AppText>
                  <AppText variant="caption" color={Colors.textMuted}>
                    {formatQuantityWithDigits(item.qtyBase, digitStyle)} {unitName}
                  </AppText>
                </View>
                <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
                  {formatMoney(item.valuationPoisha)}
                </AppText>
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* Movement Ledger Filter */}
      <View style={{ gap: 8 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('inventory.movementsFeedTitle')}
        </AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          <FilterChip
            label={t('inventory.filterAllTypes')}
            selected={!selectedType}
            onPress={() => setSelectedType(undefined)}
          />
          {MOVEMENT_FILTERS.map((type) => (
            <FilterChip
              key={type}
              label={t(`inventory.movementTypes.${type}`)}
              selected={selectedType === type}
              onPress={() => setSelectedType((prev) => (prev === type ? undefined : type))}
            />
          ))}
        </ScrollView>
      </View>

      {/* Movements Feed */}
      {movementsQuery.isLoading ? (
        <LoadingView />
      ) : movementsQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(movementsQuery.error, t)}
          onRetry={() => void movementsQuery.refetch()}
        />
      ) : movements.length === 0 ? (
        <EmptyState title={t('inventory.emptyMovements')} />
      ) : (
        <View style={{ gap: 8 }}>
          {movements.map((mov) => {
            const badge = getMovementTypeBadge(mov.movementType, t);
            const productName = getLocalizedProductName(
              { nameBn: mov.productNameBn, nameEn: mov.productNameEn },
              language,
            );
            const unitName = getLocalizedUnitName(
              { nameBn: mov.baseUnitNameBn, nameEn: mov.baseUnitNameEn },
              language,
            );
            const isNegative = mov.deltaQtyBase.startsWith('-');
            const deltaText = `${isNegative ? '' : '+'}${formatQuantityWithDigits(
              mov.deltaQtyBase,
              digitStyle,
            )} ${unitName}`;
            const afterText = `${formatQuantityWithDigits(
              mov.balanceAfterBase,
              digitStyle,
            )} ${unitName}`;

            return (
              <Card key={mov.id} style={{ gap: 6 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AppText variant="body" weight="bold" style={{ flex: 1 }}>
                    {productName}
                  </AppText>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText
                    variant="body"
                    weight="bold"
                    color={isNegative ? Colors.danger : Colors.success}
                  >
                    {deltaText}
                  </AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {t('products.stockLabel')}: {afterText}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" color={Colors.textMuted}>
                    {mov.actorName ?? ''}
                  </AppText>
                  {isOwner && mov.valuePoisha !== null ? (
                    <AppText variant="caption" weight="semibold" color={Colors.textPrimary}>
                      {formatMoney(mov.valuePoisha)}
                    </AppText>
                  ) : null}
                </View>

                {mov.reason ? (
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {mov.reason}
                  </AppText>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
