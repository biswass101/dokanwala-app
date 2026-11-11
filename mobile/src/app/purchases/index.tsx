import { formatDhakaDateTime, type PurchaseStatus } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingView,
  ScreenContainer,
  SyncStatusPill,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { OwnerOnlyScreen } from '@/features/purchases/components/OwnerOnlyScreen';
import { usePurchasesQuery } from '@/features/purchases/hooks/usePurchasesQueries';
import { getPurchaseStatusBadge } from '@/features/purchases/utils/purchase-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

type PurchaseFilterKey = 'ALL' | 'DUE_ONLY' | PurchaseStatus;

const FILTER_OPTIONS: PurchaseFilterKey[] = [
  'ALL',
  'DUE_ONLY',
  'COMPLETED',
  'PARTIALLY_RETURNED',
  'RETURNED',
];

function PurchasesHistoryContent() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PurchaseFilterKey>('ALL');

  const purchasesQuery = usePurchasesQuery({
    ...(filter === 'DUE_ONLY' ? { dueOnly: true } : filter !== 'ALL' ? { status: filter } : {}),
    ...(search.trim().length > 0 ? { q: search.trim() } : {}),
  });

  const purchases = useMemo(
    () => purchasesQuery.data?.purchases ?? [],
    [purchasesQuery.data?.purchases],
  );
  const fromOfflineCache = Boolean(purchasesQuery.data?.fromOfflineCache);

  return (
    <ScreenContainer>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('purchases.historyTitle')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={t('purchases.addNewButton')}
          testID="purchases-add-new-btn"
          onPress={() => router.push('/purchases/form')}
          style={{ flex: 1 }}
        />
        <Button
          label={t('suppliers.title')}
          variant="outline"
          onPress={() => router.push('/suppliers')}
          style={{ flex: 1 }}
        />
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      <Input
        placeholder={t('purchases.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {FILTER_OPTIONS.map((opt) => (
          <FilterChip
            key={opt}
            label={t(`purchases.filters.${opt}`)}
            selected={filter === opt}
            onPress={() => setFilter(opt)}
          />
        ))}
      </ScrollView>

      {purchasesQuery.isLoading ? (
        <LoadingView />
      ) : purchasesQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(purchasesQuery.error, t)}
          onRetry={() => void purchasesQuery.refetch()}
        />
      ) : purchases.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title={t('purchases.emptyHistoryTitle')}
          description={t('purchases.emptyHistoryDesc')}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {purchases.map((purchase) => {
            const statusBadge = getPurchaseStatusBadge(purchase.status, t);
            return (
              <Pressable
                key={purchase.id}
                accessibilityRole="button"
                testID={`purchase-card-${purchase.id}`}
                onPress={() => router.push(`/purchases/${purchase.id}`)}
              >
                <Card style={{ gap: 6, padding: 14 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <AppText variant="body" weight="bold">
                      {formatDigits(purchase.purchaseNumber)}
                    </AppText>
                    <Badge label={statusBadge.label} tone={statusBadge.tone} />
                  </View>

                  <AppText variant="caption" color={Colors.textSecondary}>
                    {purchase.supplierNameSnapshot ?? t('purchases.walkInSupplier')} •{' '}
                    {formatDhakaDateTime(purchase.purchasedAt, language, digitStyle)}
                  </AppText>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 4,
                    }}
                  >
                    <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
                      {formatMoney(purchase.totalPoisha)}
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {purchase.duePoisha > 0 ? (
                        <Badge
                          label={`${t('purchases.dueAmount')}: ${formatMoney(purchase.duePoisha)}`}
                          tone="danger"
                        />
                      ) : null}
                      {purchase.returnedTotalPoisha > 0 ? (
                        <Badge
                          label={`${t('purchases.returnedTotalAmount')}: ${formatMoney(purchase.returnedTotalPoisha)}`}
                          tone="warning"
                        />
                      ) : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}

export default function PurchasesHistoryScreen() {
  const { t } = useAppTranslation();
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'OWNER') {
    return (
      <OwnerOnlyScreen
        title={t('purchases.historyTitle')}
        description={t('purchases.ownerOnlyDesc')}
      />
    );
  }

  return <PurchasesHistoryContent />;
}
