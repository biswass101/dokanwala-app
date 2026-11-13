import {
  formatDhakaDateTime,
  getDhakaMonthStartYmd,
  getDhakaYmd,
  shiftDhakaYmd,
  type SaleStatus,
} from '@dokanwala/shared';
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

type HistoryDatePreset = 'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export default function SalesHistoryScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const todayYmd = getDhakaYmd();
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('ALL');
  const [customFrom, setCustomFrom] = useState(todayYmd);
  const [customTo, setCustomTo] = useState(todayYmd);
  const [showCustomInputs, setShowCustomInputs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const dateRange = useMemo(() => {
    switch (datePreset) {
      case 'TODAY':
        return { from: todayYmd, to: todayYmd };
      case 'YESTERDAY': {
        const y = shiftDhakaYmd(todayYmd, -1);
        return { from: y, to: y };
      }
      case 'WEEK':
        return { from: shiftDhakaYmd(todayYmd, -6), to: todayYmd };
      case 'MONTH':
        return { from: getDhakaMonthStartYmd(todayYmd), to: todayYmd };
      case 'CUSTOM':
        return { from: customFrom, to: customTo };
      default:
        return {};
    }
  }, [datePreset, todayYmd, customFrom, customTo]);

  const salesQuery = useSalesQuery({
    ...(filter === 'DUE_ONLY' ? { dueOnly: true } : filter !== 'ALL' ? { status: filter } : {}),
    ...(searchQuery.trim().length > 0 ? { q: searchQuery.trim() } : {}),
    ...(dateRange.from ? { from: dateRange.from } : {}),
    ...(dateRange.to ? { to: dateRange.to } : {}),
  });

  const sales = useMemo(() => salesQuery.data?.sales ?? [], [salesQuery.data?.sales]);
  const fromOfflineCache = Boolean(salesQuery.data?.fromOfflineCache);

  const totalSalesPoisha = useMemo(
    () =>
      sales
        .filter((s) => s.status !== 'CANCELLED')
        .reduce((sum, s) => sum + s.totalPoisha, 0),
    [sales],
  );
  const totalDuePoisha = useMemo(
    () =>
      sales
        .filter((s) => s.status !== 'CANCELLED')
        .reduce((sum, s) => sum + s.duePoisha, 0),
    [sales],
  );

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

      {/* Date Filter Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        <FilterChip
          label={t('sales.filters.ALL_DATES', { defaultValue: 'সকল তারিখ' })}
          selected={datePreset === 'ALL'}
          onPress={() => setDatePreset('ALL')}
        />
        <FilterChip
          label={t('common.today', { defaultValue: 'আজ' })}
          selected={datePreset === 'TODAY'}
          onPress={() => setDatePreset('TODAY')}
        />
        <FilterChip
          label={t('common.yesterday', { defaultValue: 'গতকাল' })}
          selected={datePreset === 'YESTERDAY'}
          onPress={() => setDatePreset('YESTERDAY')}
        />
        <FilterChip
          label={t('common.last7Days', { defaultValue: '৭ দিন' })}
          selected={datePreset === 'WEEK'}
          onPress={() => setDatePreset('WEEK')}
        />
        <FilterChip
          label={t('common.thisMonth', { defaultValue: 'চলতি মাস' })}
          selected={datePreset === 'MONTH'}
          onPress={() => setDatePreset('MONTH')}
        />
        <FilterChip
          label={t('common.customRange', { defaultValue: 'কাস্টম তারিখ' })}
          selected={datePreset === 'CUSTOM'}
          onPress={() => {
            setDatePreset('CUSTOM');
            setShowCustomInputs(!showCustomInputs);
          }}
        />
      </ScrollView>

      {/* Custom Date Inputs */}
      {datePreset === 'CUSTOM' && showCustomInputs ? (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('reports.customFromPlaceholder', { defaultValue: 'হতে (YYYY-MM-DD)' })}
              </AppText>
              <Input value={customFrom} onChangeText={setCustomFrom} placeholder="YYYY-MM-DD" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('reports.customToPlaceholder', { defaultValue: 'পর্যন্ত (YYYY-MM-DD)' })}
              </AppText>
              <Input value={customTo} onChangeText={setCustomTo} placeholder="YYYY-MM-DD" />
            </View>
          </View>
        </Card>
      ) : null}

      {/* Status Filter Row */}
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

      {/* Summary KPI Banner for filtered sales */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: Colors.surface,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <AppText variant="caption" weight="bold">
          {formatDigits(sales.length)} {t('sales.invoicesCount', { defaultValue: 'টি রসিদ' })}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AppText variant="caption" weight="bold" color={Colors.primary}>
            {t('sales.totalSales', { defaultValue: 'মোট বিক্রি' })}: {formatMoney(totalSalesPoisha)}
          </AppText>
          {totalDuePoisha > 0 ? (
            <AppText variant="caption" weight="bold" color={Colors.warning}>
              {t('sales.dueAmount')}: {formatMoney(totalDuePoisha)}
            </AppText>
          ) : null}
        </View>
      </View>

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
