import { formatDhakaDateTime, type SaleStatus } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useSalesQuery } from '@/features/sales/hooks/useSalesQueries';
import { getSaleStatusBadge } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

type HistoryFilter = 'ALL' | 'DUE_ONLY' | SaleStatus;

const FILTERS: HistoryFilter[] = [
  'ALL',
  'DUE_ONLY',
  'COMPLETED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'CANCELLED',
];

export default function SalesHistoryScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const salesQuery = useSalesQuery({
    ...(filter === 'DUE_ONLY' ? { dueOnly: true } : filter !== 'ALL' ? { status: filter } : {}),
    ...(searchQuery.trim().length > 0 ? { q: searchQuery.trim() } : {}),
  });

  const sales = salesQuery.data?.sales ?? [];
  const fromOfflineCache = Boolean(salesQuery.data?.fromOfflineCache);

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('sales.historyTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      <Input
        placeholder={t('sales.searchPlaceholder')}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f}
            label={t(`sales.filters.${f}`)}
            selected={filter === f}
            tone={f === 'DUE_ONLY' ? 'warning' : f === 'CANCELLED' ? 'danger' : 'primary'}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      {salesQuery.isLoading ? (
        <LoadingView />
      ) : salesQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(salesQuery.error, t)}
          onRetry={() => void salesQuery.refetch()}
        />
      ) : sales.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={t('sales.emptyHistoryTitle')}
          description={t('sales.emptyHistoryDesc')}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {sales.map((sale) => {
            const statusBadge = getSaleStatusBadge(sale.status, t);
            return (
              <Pressable
                key={sale.id}
                accessibilityRole="button"
                testID={`sale-history-card-${sale.id}`}
                onPress={() => router.push(`/sales/${sale.id}`)}
              >
                <Card style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="body" weight="bold">
                        {formatDigits(sale.receiptNumber)}
                      </AppText>
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {formatDhakaDateTime(sale.soldAt, language, digitStyle)}
                      </AppText>
                    </View>
                    <Badge label={statusBadge.label} tone={statusBadge.tone} />
                  </View>

                  <View
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
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {sale.customerNameSnapshot ?? t('pos.walkInCustomer')}
                      </AppText>
                      {sale.duePoisha > 0 ? (
                        <AppText variant="caption" weight="bold" color={Colors.danger}>
                          {t('sales.dueAmount')}: {formatMoney(sale.duePoisha)}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
                      {formatMoney(sale.totalPoisha)}
                    </AppText>
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
