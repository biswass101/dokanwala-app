import {
  formatDhakaDate,
  formatDhakaDateTime,
  type RecentDashboardTransactionDto,
} from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingView,
  ScreenContainer,
  SyncStatusPill,
} from '@/components';
import { useDashboardSummaryQuery } from '@/features/reports/hooks/useCashbookReportsQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function HomeScreen() {
  const { t, language, toggleLanguage } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const shop = useAuthStore((state) => state.shop);

  const dashboardQuery = useDashboardSummaryQuery();
  const isOwner = user?.role === 'OWNER';
  const dashboard = dashboardQuery.data?.dashboard;
  const fromOfflineCache = Boolean(dashboardQuery.data?.fromOfflineCache);

  const resolveTransactionKindLabel = (kind: RecentDashboardTransactionDto['kind']) => {
    switch (kind) {
      case 'SALE':
        return t('home.txKindSale');
      case 'PURCHASE':
        return t('home.txKindPurchase');
      case 'EXPENSE':
        return t('home.txKindExpense');
      case 'CUSTOMER_PAYMENT':
        return t('home.txKindCustomerPayment');
      case 'SUPPLIER_PAYMENT':
        return t('home.txKindSupplierPayment');
    }
  };

  const handleTransactionPress = (tx: RecentDashboardTransactionDto) => {
    switch (tx.kind) {
      case 'SALE':
        router.push(`/sales/${tx.referenceId}`);
        break;
      case 'PURCHASE':
        router.push(`/purchases/${tx.referenceId}`);
        break;
      case 'EXPENSE':
        router.push(`/expenses/${tx.referenceId}`);
        break;
      case 'CUSTOMER_PAYMENT':
        router.push('/customers');
        break;
      case 'SUPPLIER_PAYMENT':
        router.push('/suppliers');
        break;
    }
  };

  return (
    <ScreenContainer>
      {/* Top Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="screenTitle" weight="bold">
            {shop?.nameBn ?? t('app.name')}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {user
              ? `${t('home.greeting', { name: user.name })} • ${t(`roles.${user.role}`)}`
              : t('app.subtitle')}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            onPress={toggleLanguage}
            style={{
              minHeight: 40,
              minWidth: Layout.minTouchTarget,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="caption" weight="bold" color={Colors.primary}>
              {t('app.languageToggle')}
            </AppText>
          </Pressable>
        </View>
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {/* Quick Actions (5 core shortcuts) */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('home.quickActionsTitle')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label={t('home.actions.newSale')}
            onPress={() => router.push('/(tabs)/sales')}
            style={{ flexGrow: 1, minWidth: '45%' }}
          />
          <Button
            label={t('home.actions.collectDue')}
            variant="secondary"
            onPress={() => router.push('/customers')}
            style={{ flexGrow: 1, minWidth: '45%' }}
          />
          <Button
            label={t('home.actions.expense')}
            variant="outline"
            onPress={() => router.push('/expenses/form')}
            style={{ flexGrow: 1, minWidth: '30%' }}
          />
          <Button
            label={t('home.actions.addProduct')}
            variant="outline"
            onPress={() => router.push(isOwner ? '/products/form' : '/(tabs)/products')}
            style={{ flexGrow: 1, minWidth: '30%' }}
          />
          {isOwner ? (
            <Button
              label={t('home.actions.purchase')}
              variant="outline"
              onPress={() => router.push('/purchases/form')}
              style={{ flexGrow: 1, minWidth: '30%' }}
            />
          ) : (
            <Button
              label={t('cashbook.todayBtn')}
              variant="outline"
              onPress={() => router.push('/cashbook')}
              style={{ flexGrow: 1, minWidth: '30%' }}
            />
          )}
        </View>
      </Card>

      {/* Dashboard KPI Grid */}
      {dashboardQuery.isLoading ? (
        <LoadingView />
      ) : dashboardQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(dashboardQuery.error, t)}
          onRetry={() => void dashboardQuery.refetch()}
        />
      ) : dashboard ? (
        <>
          <Card style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <AppText variant="sectionTitle" weight="semibold">
                {t('home.todaySummaryTitle')}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                {formatDhakaDate(`${dashboard.businessDate}T12:00:00+06:00`, language, digitStyle)}
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {/* Today's Sales */}
              <View
                style={{
                  flex: 1,
                  minWidth: '46%',
                  backgroundColor: Colors.primarySoft,
                  borderRadius: 10,
                  padding: 12,
                  gap: 4,
                }}
              >
                <AppText variant="caption" color={Colors.primaryPressed}>
                  {t('home.todaySalesLabel')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
                  {formatMoney(dashboard.todayNetSalesPoisha)}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('home.salesCountBadge', {
                    count: formatDigits(String(dashboard.todaySalesCount)),
                  })}
                </AppText>
              </View>

              {/* Today's Expenses */}
              <View
                style={{
                  flex: 1,
                  minWidth: '46%',
                  backgroundColor: Colors.warningSoft,
                  borderRadius: 10,
                  padding: 12,
                  gap: 4,
                }}
              >
                <AppText variant="caption" color={Colors.warning}>
                  {t('home.todayExpensesLabel')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.warning}>
                  {formatMoney(dashboard.todayExpensesPoisha)}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('home.todayCashReceivedLabel')}: {formatMoney(dashboard.todayCashReceivedPoisha)}
                </AppText>
              </View>

              {/* Owner-only Profit Cards */}
              {isOwner && dashboard.todayGrossProfitPoisha !== null ? (
                <View
                  style={{
                    flex: 1,
                    minWidth: '46%',
                    backgroundColor: Colors.successSoft,
                    borderRadius: 10,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <AppText variant="caption" color={Colors.success}>
                    {t('home.todayGrossProfitLabel')}
                  </AppText>
                  <AppText variant="sectionTitle" weight="bold" color={Colors.success}>
                    {formatMoney(dashboard.todayGrossProfitPoisha)}
                  </AppText>
                </View>
              ) : null}

              {isOwner && dashboard.todayNetProfitPoisha !== null ? (
                <View
                  style={{
                    flex: 1,
                    minWidth: '46%',
                    backgroundColor:
                      dashboard.todayNetProfitPoisha >= 0 ? Colors.successSoft : Colors.dangerSoft,
                    borderRadius: 10,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <AppText
                    variant="caption"
                    color={dashboard.todayNetProfitPoisha >= 0 ? Colors.success : Colors.danger}
                  >
                    {t('home.todayNetProfitLabel')}
                  </AppText>
                  <AppText
                    variant="sectionTitle"
                    weight="bold"
                    color={dashboard.todayNetProfitPoisha >= 0 ? Colors.success : Colors.danger}
                  >
                    {formatMoney(dashboard.todayNetProfitPoisha)}
                  </AppText>
                </View>
              ) : null}

              {/* Customer Receivables */}
              <Pressable
                onPress={() => router.push('/customers')}
                style={{
                  flex: 1,
                  minWidth: '46%',
                  backgroundColor: Colors.background,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 12,
                  gap: 4,
                }}
              >
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('home.customerDueTotalLabel')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
                  {formatMoney(dashboard.customerDueTotalPoisha)}
                </AppText>
              </Pressable>

              {/* Supplier Payables (Owner) or Cash Collected */}
              {isOwner ? (
                <Pressable
                  onPress={() => router.push('/suppliers')}
                  style={{
                    flex: 1,
                    minWidth: '46%',
                    backgroundColor: Colors.background,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {t('home.supplierPayableLabel')}
                  </AppText>
                  <AppText variant="sectionTitle" weight="bold" color={Colors.warning}>
                    {formatMoney(dashboard.supplierPayableTotalPoisha)}
                  </AppText>
                </Pressable>
              ) : null}

              {/* Products & Low-Stock Alerts */}
              <Pressable
                onPress={() => router.push('/(tabs)/products')}
                style={{
                  flex: 1,
                  minWidth: '46%',
                  backgroundColor: Colors.background,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 12,
                  gap: 4,
                }}
              >
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('home.totalProductsLabel')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold">
                  {formatDigits(String(dashboard.totalProducts))}
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => router.push('/(tabs)/products')}
                style={{
                  flex: 1,
                  minWidth: '46%',
                  backgroundColor:
                    dashboard.lowStockCount > 0 ? Colors.dangerSoft : Colors.background,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: dashboard.lowStockCount > 0 ? '#FECACA' : Colors.border,
                  padding: 12,
                  gap: 4,
                }}
              >
                <AppText
                  variant="caption"
                  color={dashboard.lowStockCount > 0 ? Colors.danger : Colors.textSecondary}
                >
                  {t('home.lowStockAlertsLabel')}
                </AppText>
                <AppText
                  variant="sectionTitle"
                  weight="bold"
                  color={dashboard.lowStockCount > 0 ? Colors.danger : Colors.textPrimary}
                >
                  {formatDigits(String(dashboard.lowStockCount))}
                </AppText>
              </Pressable>
            </View>
          </Card>

          {/* Daily Cashbook Status Banner */}
          <Card style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="sectionTitle" weight="semibold">
                  {t('home.cashbookBannerTitle')}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('home.expectedCashLabel')}: {formatMoney(dashboard.cashbookExpectedCashPoisha)}
                </AppText>
              </View>
              <Badge
                label={t(`cashbook.status${dashboard.cashbookStatus}`)}
                tone={
                  dashboard.cashbookStatus === 'OPEN'
                    ? 'success'
                    : dashboard.cashbookStatus === 'CLOSED'
                      ? 'primary'
                      : 'warning'
                }
              />
            </View>
            <Button
              label={t('home.openCashbookAction')}
              variant="outline"
              onPress={() => router.push('/cashbook')}
            />
          </Card>

          {/* Recent Transactions */}
          <Card style={{ gap: 10 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('home.recentTransactionsTitle')}
            </AppText>

            {dashboard.recentTransactions.length === 0 ? (
              <AppText variant="body" color={Colors.textMuted}>
                {t('home.noRecentTransactions')}
              </AppText>
            ) : (
              <View style={{ gap: 8 }}>
                {dashboard.recentTransactions.map((tx) => (
                  <Pressable
                    key={tx.id}
                    onPress={() => handleTransactionPress(tx)}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Badge
                          label={resolveTransactionKindLabel(tx.kind)}
                          tone={tx.direction === 'IN' ? 'success' : 'warning'}
                        />
                        <AppText variant="body" weight="semibold">
                          {tx.title}
                        </AppText>
                      </View>
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {tx.subtitle ? `${tx.subtitle} • ` : ''}
                        {formatDhakaDateTime(tx.occurredAt, language, digitStyle)}
                      </AppText>
                    </View>
                    <AppText
                      variant="body"
                      weight="bold"
                      color={tx.direction === 'IN' ? Colors.success : Colors.danger}
                    >
                      {tx.direction === 'IN' ? '+' : '-'}
                      {formatMoney(tx.amountPoisha)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            )}

            <Button
              label={t('home.refreshDashboard')}
              variant="outline"
              loading={dashboardQuery.isFetching}
              onPress={() => void dashboardQuery.refetch()}
            />
          </Card>
        </>
      ) : null}
    </ScreenContainer>
  );
}
