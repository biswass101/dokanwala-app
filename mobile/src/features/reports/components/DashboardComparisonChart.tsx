import type {
  DashboardChartPointDto,
  DashboardComparisonItemDto,
  DashboardPaymentDistributionDto,
} from '@dokanwala/shared';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText, Card } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';

export interface DashboardComparisonChartProps {
  chartSeries?: DashboardChartPointDto[];
  comparisonLabel?: string;
  currentLabel?: string;
  paymentDistribution?: DashboardPaymentDistributionDto;
  salesComparison?: DashboardComparisonItemDto;
}

export function DashboardComparisonChart({
  chartSeries = [],
  comparisonLabel = 'পূর্ববর্তী',
  currentLabel = 'চলতি সময়',
  paymentDistribution,
  salesComparison,
}: DashboardComparisonChartProps) {
  const { t } = useAppTranslation();
  const { formatMoney, formatDigits } = useFormattedMoney();

  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);

  if (chartSeries.length === 0 && !paymentDistribution) {
    return null;
  }

  const maxVal = Math.max(
    ...chartSeries.map((p) => Math.max(p.currentPoisha, p.previousPoisha)),
    1000,
  );

  const selectedPoint = chartSeries.find((p) => p.key === selectedPointKey);

  // Calculate payment distribution percentages
  const totalPaymentPoisha = paymentDistribution
    ? paymentDistribution.cashPoisha +
      paymentDistribution.bkashPoisha +
      paymentDistribution.nagadPoisha +
      paymentDistribution.otherPoisha +
      paymentDistribution.creditPoisha
    : 0;

  const cashPct =
    totalPaymentPoisha > 0
      ? Math.round(((paymentDistribution?.cashPoisha ?? 0) / totalPaymentPoisha) * 100)
      : 0;
  const mfsPct =
    totalPaymentPoisha > 0
      ? Math.round(
          (((paymentDistribution?.bkashPoisha ?? 0) +
            (paymentDistribution?.nagadPoisha ?? 0) +
            (paymentDistribution?.otherPoisha ?? 0)) /
            totalPaymentPoisha) *
            100,
        )
      : 0;
  const creditPct =
    totalPaymentPoisha > 0
      ? Math.max(0, 100 - cashPct - mfsPct)
      : 0;

  return (
    <Card style={{ gap: 14 }}>
      {/* Chart Title and Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <View>
          <AppText variant="sectionTitle" weight="semibold">
            {t('home.salesComparisonChartTitle', { defaultValue: 'বিক্রি তুলনা ও ট্রেন্ড' })}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('home.chartSubtitle', {
              defaultValue: 'চলতি বনাম পূর্ববর্তী সময়ের তুলনামূলক চার্ট',
            })}
          </AppText>
        </View>

        {/* Legend */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: Colors.primary,
              }}
            />
            <AppText variant="caption" color={Colors.textSecondary}>
              {currentLabel}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: '#CBD5E1',
              }}
            />
            <AppText variant="caption" color={Colors.textSecondary}>
              {comparisonLabel}
            </AppText>
          </View>
        </View>
      </View>

      {/* Selected Point Inspection Tooltip */}
      {selectedPoint ? (
        <View
          style={{
            backgroundColor: Colors.background,
            padding: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View>
            <AppText variant="caption" weight="bold" color={Colors.primary}>
              {selectedPoint.key}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {currentLabel}: {formatMoney(selectedPoint.currentPoisha)} ({formatDigits(selectedPoint.currentCount)} টি)
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              {comparisonLabel}: {formatMoney(selectedPoint.previousPoisha)} ({formatDigits(selectedPoint.previousCount)} টি)
            </AppText>
            <AppText
              variant="caption"
              weight="bold"
              color={
                selectedPoint.currentPoisha >= selectedPoint.previousPoisha
                  ? Colors.success
                  : Colors.danger
              }
            >
              {selectedPoint.currentPoisha >= selectedPoint.previousPoisha ? '↑ +' : '↓ -'}
              {formatMoney(Math.abs(selectedPoint.currentPoisha - selectedPoint.previousPoisha))}
            </AppText>
          </View>
        </View>
      ) : null}

      {/* Bar Chart Area */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: 'flex-end',
          height: 140,
          paddingVertical: 4,
          paddingHorizontal: 6,
          gap: 12,
        }}
      >
        {chartSeries.map((point) => {
          const isSelected = selectedPointKey === point.key;
          const currentHeight = Math.max(4, Math.round((point.currentPoisha / maxVal) * 95));
          const previousHeight = Math.max(4, Math.round((point.previousPoisha / maxVal) * 95));

          return (
            <Pressable
              key={point.key}
              onPress={() => setSelectedPointKey(isSelected ? null : point.key)}
              style={{
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: 3,
                  height: 100,
                }}
              >
                {/* Previous period bar */}
                <View
                  style={{
                    width: 10,
                    height: previousHeight,
                    backgroundColor: isSelected ? '#94A3B8' : '#CBD5E1',
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                  }}
                />
                {/* Current period bar */}
                <View
                  style={{
                    width: 12,
                    height: currentHeight,
                    backgroundColor: isSelected ? Colors.primaryPressed : Colors.primary,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                  }}
                />
              </View>
              <AppText
                variant="caption"
                weight={isSelected ? 'bold' : 'regular'}
                color={isSelected ? Colors.primary : Colors.textMuted}
                style={{ fontSize: 10 }}
              >
                {point.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Payment Distribution Visual Progress */}
      {paymentDistribution && totalPaymentPoisha > 0 ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="caption" weight="semibold">
              {t('home.paymentBreakdownTitle', { defaultValue: 'পেমেন্ট মাধ্যম অনুপাত' })}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('home.totalRecorded', { defaultValue: 'মোট' })}: {formatMoney(totalPaymentPoisha)}
            </AppText>
          </View>

          {/* Stacked bar */}
          <View
            style={{
              height: 12,
              borderRadius: 6,
              overflow: 'hidden',
              flexDirection: 'row',
              backgroundColor: Colors.border,
            }}
          >
            {cashPct > 0 ? (
              <View
                style={{
                  width: `${cashPct}%`,
                  backgroundColor: Colors.success,
                }}
              />
            ) : null}
            {mfsPct > 0 ? (
              <View
                style={{
                  width: `${mfsPct}%`,
                  backgroundColor: '#EC4899', // Pink for bKash/Nagad
                }}
              />
            ) : null}
            {creditPct > 0 ? (
              <View
                style={{
                  width: `${creditPct}%`,
                  backgroundColor: Colors.warning,
                }}
              />
            ) : null}
          </View>

          {/* Distribution legend pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: Colors.success,
                }}
              />
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('paymentMethods.CASH')}: {formatMoney(paymentDistribution.cashPoisha)} ({formatDigits(cashPct)}%)
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#EC4899',
                }}
              />
              <AppText variant="caption" color={Colors.textSecondary}>
                MFS (বিকাশ/নগদ): {formatMoney(
                  paymentDistribution.bkashPoisha +
                    paymentDistribution.nagadPoisha +
                    paymentDistribution.otherPoisha,
                )} ({formatDigits(mfsPct)}%)
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: Colors.warning,
                }}
              />
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('sales.dueAmount')}: {formatMoney(paymentDistribution.creditPoisha)} ({formatDigits(creditPct)}%)
              </AppText>
            </View>
          </View>
        </View>
      ) : null}
    </Card>
  );
}
