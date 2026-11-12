import {
  formatDhakaDate,
  getDhakaMonthStartYmd,
  getDhakaYmd,
  shiftDhakaYmd,
  type SalesReportPeriod,
} from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
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
import { useValuationQuery } from '@/features/products/hooks/useCatalogQueries';
import {
  useDuesReportQuery,
  useProductsReportQuery,
  useProfitLossReportQuery,
  useSalesReportQuery,
} from '@/features/reports/hooks/useCashbookReportsQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { reportsApi } from '@/services/api/reports';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';
import { saveAndShareBytes } from '@/utils/file-export';

type ReportDatePreset = 'today' | 'week' | 'month' | 'custom';
type ReportTab = 'sales' | 'pnl' | 'products' | 'dues';

function normalizeYmdDigits(raw: string): string {
  const bn = '০১২৩৪৫৬৭৮৯';
  return raw
    .trim()
    .replace(/[০-৯]/g, (ch) => String(bn.indexOf(ch)));
}

export default function ReportsScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role ?? 'EMPLOYEE');
  const isOwner = role === 'OWNER';

  const todayYmd = getDhakaYmd();
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('month');
  const [customFromRaw, setCustomFromRaw] = useState(getDhakaMonthStartYmd(todayYmd));
  const [customToRaw, setCustomToRaw] = useState(todayYmd);
  const [appliedCustomRange, setAppliedCustomRange] = useState({
    from: getDhakaMonthStartYmd(todayYmd),
    to: todayYmd,
  });
  const [customError, setCustomError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [salesPeriod, setSalesPeriod] = useState<SalesReportPeriod>('daily');
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const activeRange = useMemo(() => {
    switch (datePreset) {
      case 'today':
        return { from: todayYmd, to: todayYmd };
      case 'week':
        return { from: shiftDhakaYmd(todayYmd, -6), to: todayYmd };
      case 'month':
        return { from: getDhakaMonthStartYmd(todayYmd), to: todayYmd };
      case 'custom':
        return appliedCustomRange;
    }
  }, [datePreset, todayYmd, appliedCustomRange]);

  const salesQuery = useSalesReportQuery({
    period: salesPeriod,
    from: activeRange.from,
    to: activeRange.to,
  });
  const pnlQuery = useProfitLossReportQuery(activeRange);
  const productsQuery = useProductsReportQuery(activeRange);
  const duesQuery = useDuesReportQuery();
  const valuationQuery = useValuationQuery(isOwner && activeTab === 'dues');

  const handleApplyCustomRange = () => {
    const from = normalizeYmdDigits(customFromRaw);
    const to = normalizeYmdDigits(customToRaw);
    const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymdPattern.test(from) || !ymdPattern.test(to) || from > to) {
      setCustomError(t('validation.reportDateRangeInvalid'));
      return;
    }
    setCustomError(null);
    setAppliedCustomRange({ from, to });
    setDatePreset('custom');
  };

  const anyOfflineCache =
    (activeTab === 'sales' && salesQuery.data?.fromOfflineCache) ||
    (activeTab === 'pnl' && pnlQuery.data?.fromOfflineCache) ||
    (activeTab === 'products' && productsQuery.data?.fromOfflineCache) ||
    (activeTab === 'dues' && duesQuery.data?.fromOfflineCache);

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExportError(null);
    setExportMessage(null);
    setExportingFormat(format);
    try {
      const reportKind =
        activeTab === 'pnl'
          ? 'profit-loss'
          : activeTab === 'products'
            ? 'products'
            : activeTab === 'dues'
              ? 'dues'
              : 'sales';
      const exported = await reportsApi.downloadExport({
        report: reportKind,
        format,
        lang: language,
        ...(reportKind === 'sales' ? { period: salesPeriod } : {}),
        ...(reportKind !== 'dues' ? { from: activeRange.from, to: activeRange.to } : {}),
      });
      await saveAndShareBytes({
        bytes: exported.bytes,
        filename: exported.filename,
        mimeType: exported.mimeType,
        dialogTitle: t('reports.exportSectionTitle'),
      });
      setExportMessage(t('reports.exportSuccess', { filename: exported.filename }));
    } catch (err) {
      setExportError(getLocalizedErrorMessage(err, t));
    } finally {
      setExportingFormat(null);
    }
  };

  const canExportCurrentTab = activeTab !== 'pnl' || isOwner;

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
          {t('reports.title')}
        </AppText>
        <SyncStatusPill />
      </View>

      {anyOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      <Button
        label={t('reports.openCashbookButton')}
        variant="secondary"
        onPress={() => router.push('/cashbook')}
      />

      {/* Date Preset Filter Chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['today', 'week', 'month', 'custom'] as ReportDatePreset[]).map((preset) => (
          <FilterChip
            key={preset}
            label={t(`reports.presets.${preset}`)}
            selected={datePreset === preset}
            onPress={() => setDatePreset(preset)}
          />
        ))}
      </View>

      {datePreset === 'custom' ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('reports.customFromLabel')}
                accessibilityLabel={t('reports.customFromLabel')}
                value={customFromRaw}
                onChangeText={setCustomFromRaw}
                placeholder="2026-11-01"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('reports.customToLabel')}
                accessibilityLabel={t('reports.customToLabel')}
                value={customToRaw}
                onChangeText={setCustomToRaw}
                placeholder="2026-11-12"
              />
            </View>
          </View>
          {customError ? (
            <AppText variant="caption" color={Colors.danger}>
              {customError}
            </AppText>
          ) : null}
          <Button label={t('reports.applyFilter')} onPress={handleApplyCustomRange} />
        </Card>
      ) : null}

      {/* Report Section Switcher */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['sales', 'pnl', 'products', 'dues'] as ReportTab[]).map((tabKey) => (
          <FilterChip
            key={tabKey}
            label={t(`reports.tabs.${tabKey}`)}
            selected={activeTab === tabKey}
            onPress={() => setActiveTab(tabKey)}
          />
        ))}
      </View>

      {canExportCurrentTab ? (
        <Card style={{ gap: 8, padding: 12 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('reports.exportSectionTitle')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t('reports.exportCsvButton')}
              testID="reports-export-csv-btn"
              variant="outline"
              loading={exportingFormat === 'csv'}
              onPress={() => void handleExport('csv')}
              style={{ flex: 1 }}
            />
            <Button
              label={t('reports.exportPdfButton')}
              testID="reports-export-pdf-btn"
              variant="secondary"
              loading={exportingFormat === 'pdf'}
              onPress={() => void handleExport('pdf')}
              style={{ flex: 1 }}
            />
          </View>
          {exportMessage ? (
            <AppText testID="reports-export-feedback" variant="caption" color={Colors.success}>
              {exportMessage}
            </AppText>
          ) : null}
          {exportError ? (
            <AppText variant="caption" color={Colors.danger}>
              {exportError}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {/* SALES REPORT TAB */}
      {activeTab === 'sales' ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <FilterChip
              label={t('reports.salesPeriodDaily')}
              selected={salesPeriod === 'daily'}
              onPress={() => setSalesPeriod('daily')}
            />
            <FilterChip
              label={t('reports.salesPeriodWeekly')}
              selected={salesPeriod === 'weekly'}
              onPress={() => setSalesPeriod('weekly')}
            />
            <FilterChip
              label={t('reports.salesPeriodMonthly')}
              selected={salesPeriod === 'monthly'}
              onPress={() => setSalesPeriod('monthly')}
            />
          </View>

          {salesQuery.isLoading ? (
            <LoadingView />
          ) : salesQuery.isError ? (
            <ErrorState
              message={getLocalizedErrorMessage(salesQuery.error, t)}
              onRetry={() => void salesQuery.refetch()}
            />
          ) : salesQuery.data?.report ? (
            <>
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {t('reports.netSalesLabel')}
                  </AppText>
                  <Badge
                    label={t('home.salesCountBadge', {
                      count: formatDigits(String(salesQuery.data.report.totals.salesCount)),
                    })}
                    tone="primary"
                  />
                </View>
                <AppText variant="kpiHero" weight="bold" color={Colors.primaryPressed}>
                  {formatMoney(salesQuery.data.report.totals.netSalesPoisha)}
                </AppText>

                <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 }}>
                  <RowMetric
                    label={t('reports.grossSalesLabel')}
                    value={formatMoney(salesQuery.data.report.totals.grossSalesPoisha)}
                  />
                  <RowMetric
                    label={t('reports.discountsLabel')}
                    value={`-${formatMoney(salesQuery.data.report.totals.discountsPoisha)}`}
                  />
                  <RowMetric
                    label={t('reports.returnsLabel')}
                    value={`-${formatMoney(salesQuery.data.report.totals.returnsPoisha)}`}
                  />
                  <RowMetric
                    label={t('reports.dueGivenLabel')}
                    value={formatMoney(salesQuery.data.report.totals.creditIssuedPoisha)}
                  />
                  <RowMetric
                    label={t('reports.dueCollectedLabel')}
                    value={formatMoney(salesQuery.data.report.totals.dueCollectedPoisha)}
                  />
                  {isOwner && salesQuery.data.report.totals.grossProfitPoisha !== null ? (
                    <RowMetric
                      label={t('reports.grossProfitLabel')}
                      value={formatMoney(salesQuery.data.report.totals.grossProfitPoisha)}
                      highlightColor={Colors.success}
                    />
                  ) : null}
                </View>
              </Card>

              {/* Payment Method Breakdown */}
              <Card style={{ gap: 8 }}>
                <AppText variant="sectionTitle" weight="semibold">
                  {t('reports.paymentBreakdownTitle')}
                </AppText>
                <RowMetric
                  label={t('sales.methods.CASH')}
                  value={formatMoney(salesQuery.data.report.paymentBreakdown.cashPoisha)}
                />
                <RowMetric
                  label={t('sales.methods.BKASH')}
                  value={formatMoney(salesQuery.data.report.paymentBreakdown.bkashPoisha)}
                />
                <RowMetric
                  label={t('sales.methods.NAGAD')}
                  value={formatMoney(salesQuery.data.report.paymentBreakdown.nagadPoisha)}
                />
                <RowMetric
                  label={t('sales.methods.OTHER')}
                  value={formatMoney(salesQuery.data.report.paymentBreakdown.otherPoisha)}
                />
              </Card>

              {/* Period Buckets */}
              <Card style={{ gap: 8 }}>
                <AppText variant="sectionTitle" weight="semibold">
                  {t('reports.salesBucketsTitle')}
                </AppText>
                {salesQuery.data.report.buckets.length === 0 ? (
                  <AppText variant="body" color={Colors.textMuted}>
                    {t('reports.noSalesInRange')}
                  </AppText>
                ) : (
                  salesQuery.data.report.buckets.map((bucket) => (
                    <View
                      key={bucket.bucketKey}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: Colors.border,
                      }}
                    >
                      <View>
                        <AppText variant="body" weight="semibold">
                          {salesPeriod === 'monthly'
                            ? bucket.label
                            : formatDhakaDate(
                                `${bucket.bucketKey}T12:00:00+06:00`,
                                language,
                                digitStyle,
                              )}
                        </AppText>
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {t('home.salesCountBadge', {
                            count: formatDigits(String(bucket.salesCount)),
                          })}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
                          {formatMoney(bucket.netSalesPoisha)}
                        </AppText>
                        {isOwner && bucket.grossProfitPoisha !== null ? (
                          <AppText variant="caption" color={Colors.success}>
                            {t('reports.grossProfitLabel')}: {formatMoney(bucket.grossProfitPoisha)}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </>
          ) : null}
        </View>
      ) : null}

      {/* PROFIT & LOSS REPORT TAB (OWNER-ONLY) */}
      {activeTab === 'pnl' ? (
        !isOwner ? (
          <EmptyState
            icon="lock-closed-outline"
            title={t('reports.pnlOwnerOnlyTitle')}
            description={t('reports.pnlOwnerOnlyDesc')}
          />
        ) : pnlQuery.isLoading ? (
          <LoadingView />
        ) : pnlQuery.isError ? (
          <ErrorState
            message={getLocalizedErrorMessage(pnlQuery.error, t)}
            onRetry={() => void pnlQuery.refetch()}
          />
        ) : pnlQuery.data?.report ? (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 8 }}>
              <AppText variant="sectionTitle" weight="bold">
                {t('reports.pnlStatementTitle')}
              </AppText>
              <RowMetric
                label={t('reports.grossSalesLabel')}
                value={formatMoney(pnlQuery.data.report.grossSalesPoisha)}
              />
              <RowMetric
                label={t('reports.discountsLabel')}
                value={`-${formatMoney(pnlQuery.data.report.discountsPoisha)}`}
              />
              <RowMetric
                label={t('reports.returnsLabel')}
                value={`-${formatMoney(pnlQuery.data.report.salesReturnsPoisha)}`}
              />
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6 }}>
                <RowMetric
                  label={t('reports.netSalesLabel')}
                  value={formatMoney(pnlQuery.data.report.netSalesPoisha)}
                  bold
                />
              </View>
              <RowMetric
                label={t('reports.netCogsLabel')}
                value={`-${formatMoney(pnlQuery.data.report.netCogsPoisha)}`}
              />
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6 }}>
                <RowMetric
                  label={t('reports.grossProfitLabel')}
                  value={formatMoney(pnlQuery.data.report.grossProfitPoisha)}
                  bold
                  highlightColor={Colors.success}
                />
              </View>

              <AppText
                variant="caption"
                weight="semibold"
                color={Colors.textSecondary}
                style={{ marginTop: 6 }}
              >
                {t('reports.wastageDamageTitle')}
              </AppText>
              <RowMetric
                label={t('reports.wastageLabel')}
                value={`-${formatMoney(pnlQuery.data.report.wastageLossPoisha)}`}
              />
              <RowMetric
                label={t('reports.damageLabel')}
                value={`-${formatMoney(pnlQuery.data.report.damageLossPoisha)}`}
              />
              <RowMetric
                label={t('reports.expiredLabel')}
                value={`-${formatMoney(pnlQuery.data.report.expiredLossPoisha)}`}
              />
              <RowMetric
                label={t('reports.countShrinkageLabel')}
                value={`-${formatMoney(pnlQuery.data.report.countShrinkageLossPoisha)}`}
              />

              <RowMetric
                label={t('reports.operatingExpensesLabel')}
                value={`-${formatMoney(pnlQuery.data.report.totalOperatingExpensesPoisha)}`}
                bold
                highlightColor={Colors.warning}
              />

              {pnlQuery.data.report.expensesByCategory.map((cat) => (
                <View key={cat.categoryId} style={{ paddingLeft: 12 }}>
                  <RowMetric label={`• ${cat.categoryNameBn}`} value={formatMoney(cat.amountPoisha)} />
                </View>
              ))}

              <View
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor:
                    pnlQuery.data.report.netProfitPoisha >= 0
                      ? Colors.successSoft
                      : Colors.dangerSoft,
                }}
              >
                <RowMetric
                  label={t('reports.netProfitLabel')}
                  value={formatMoney(pnlQuery.data.report.netProfitPoisha)}
                  bold
                  highlightColor={
                    pnlQuery.data.report.netProfitPoisha >= 0 ? Colors.success : Colors.danger
                  }
                />
              </View>
            </Card>

            {/* Informational Purchases Card */}
            <Card style={{ gap: 8, backgroundColor: Colors.background }}>
              <AppText variant="sectionTitle" weight="semibold">
                {t('reports.purchasesInfoTitle')}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('reports.purchasesInfoDesc')}
              </AppText>
              <RowMetric
                label={t('reports.netPurchasesLabel')}
                value={formatMoney(pnlQuery.data.report.purchasesSummary.netPurchasesPoisha)}
              />
              <RowMetric
                label={t('reports.cashPaidSuppliersLabel')}
                value={formatMoney(pnlQuery.data.report.purchasesSummary.cashPaidToSuppliersPoisha)}
              />
            </Card>
          </View>
        ) : null
      ) : null}

      {/* PRODUCTS REPORT TAB */}
      {activeTab === 'products' ? (
        productsQuery.isLoading ? (
          <LoadingView />
        ) : productsQuery.isError ? (
          <ErrorState
            message={getLocalizedErrorMessage(productsQuery.error, t)}
            onRetry={() => void productsQuery.refetch()}
          />
        ) : productsQuery.data?.report ? (
          <Card style={{ gap: 10 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('reports.topProductsTitle')}
            </AppText>
            {productsQuery.data.report.items.length === 0 ? (
              <AppText variant="body" color={Colors.textMuted}>
                {t('reports.noProductSales')}
              </AppText>
            ) : (
              productsQuery.data.report.items.map((item) => (
                <View
                  key={item.productId}
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
                    <AppText variant="body" weight="semibold">
                      {item.productNameBn}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('reports.soldQtyLabel')}:{' '}
                      {formatDigits(String(Number(item.netQtyBase)))} {item.baseUnitNameBn}
                    </AppText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
                      {formatMoney(item.netRevenuePoisha)}
                    </AppText>
                    {isOwner && item.grossProfitPoisha !== null ? (
                      <AppText variant="caption" color={Colors.success}>
                        {t('reports.grossProfitLabel')}: {formatMoney(item.grossProfitPoisha)}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Card>
        ) : null
      ) : null}

      {/* DUES & VALUATION TAB */}
      {activeTab === 'dues' ? (
        duesQuery.isLoading ? (
          <LoadingView />
        ) : duesQuery.isError ? (
          <ErrorState
            message={getLocalizedErrorMessage(duesQuery.error, t)}
            onRetry={() => void duesQuery.refetch()}
          />
        ) : duesQuery.data?.report ? (
          <View style={{ gap: 12 }}>
            {isOwner && valuationQuery.data?.valuation ? (
              <Card style={{ gap: 8, backgroundColor: Colors.primarySoft, borderColor: '#99F6E4' }}>
                <AppText variant="sectionTitle" weight="semibold" color={Colors.primaryPressed}>
                  {t('reports.inventoryValuationTitle')}
                </AppText>
                <RowMetric
                  label={t('reports.totalStockValueLabel')}
                  value={formatMoney(valuationQuery.data.valuation.totalValuationPoisha)}
                  bold
                  highlightColor={Colors.primaryPressed}
                />
                <RowMetric
                  label={t('reports.totalSkusLabel')}
                  value={formatDigits(String(valuationQuery.data.valuation.totalActiveProducts))}
                />
              </Card>
            ) : null}

            {/* Customer Receivables */}
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="sectionTitle" weight="semibold">
                  {t('reports.duesCustomerTitle', {
                    count: formatDigits(String(duesQuery.data.report.customersWithDueCount)),
                  })}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
                  {formatMoney(duesQuery.data.report.totalCustomerDuePoisha)}
                </AppText>
              </View>
              {duesQuery.data.report.customers.length === 0 ? (
                <AppText variant="body" color={Colors.textMuted}>
                  {t('reports.noCustomerDues')}
                </AppText>
              ) : (
                duesQuery.data.report.customers.slice(0, 15).map((cust) => (
                  <View
                    key={cust.customerId}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                    }}
                  >
                    <AppText variant="body">{cust.nameBn}</AppText>
                    <AppText variant="body" weight="bold" color={Colors.danger}>
                      {formatMoney(cust.duePoisha)}
                    </AppText>
                  </View>
                ))
              )}
            </Card>

            {/* Supplier Payables */}
            {isOwner ? (
              <Card style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="sectionTitle" weight="semibold">
                    {t('reports.duesSupplierTitle', {
                      count: formatDigits(String(duesQuery.data.report.suppliersWithPayableCount)),
                    })}
                  </AppText>
                  <AppText variant="sectionTitle" weight="bold" color={Colors.warning}>
                    {formatMoney(duesQuery.data.report.totalSupplierPayablePoisha)}
                  </AppText>
                </View>
                {duesQuery.data.report.suppliers.length === 0 ? (
                  <AppText variant="body" color={Colors.textMuted}>
                    {t('reports.noSupplierPayables')}
                  </AppText>
                ) : (
                  duesQuery.data.report.suppliers.slice(0, 15).map((sup) => (
                    <View
                      key={sup.supplierId}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingVertical: 6,
                        borderBottomWidth: 1,
                        borderBottomColor: Colors.border,
                      }}
                    >
                      <AppText variant="body">{sup.nameBn}</AppText>
                      <AppText variant="body" weight="bold" color={Colors.warning}>
                        {formatMoney(sup.payablePoisha)}
                      </AppText>
                    </View>
                  ))
                )}
              </Card>
            ) : null}
          </View>
        ) : null
      ) : null}
    </ScreenContainer>
  );
}

function RowMetric({
  label,
  value,
  bold = false,
  highlightColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlightColor?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText
        variant="body"
        weight={bold ? 'bold' : 'regular'}
        color={highlightColor ?? Colors.textSecondary}
        style={{ flex: 1 }}
      >
        {label}
      </AppText>
      <AppText
        variant="body"
        weight={bold ? 'bold' : 'semibold'}
        color={highlightColor ?? Colors.textPrimary}
      >
        {value}
      </AppText>
    </View>
  );
}
