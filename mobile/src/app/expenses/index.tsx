import {
  formatDhakaDateTime,
  getDhakaYmd,
  shiftDhakaYmd,
  type ExpenseCategoryDto,
  type ExpenseDto,
} from '@dokanwala/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  CalendarPickerModal,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingView,
  ScreenContainer,
  SyncStatusPill,
  formatReadableDhakaYmd,
} from '@/components';
import { getLocalizedExpenseCategoryName } from '@/features/customers/utils/customer-format';
import {
  useExpenseCategoriesQuery,
  useExpensesQuery,
} from '@/features/expenses/hooks/useExpensesQueries';
import { FilterChip } from '@/features/products/components/FilterChip';
import { getPaymentMethodLabel } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

type ExpenseDatePreset = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM_DATE';

const DATE_PRESETS: ('ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH')[] = [
  'ALL',
  'TODAY',
  'LAST_7_DAYS',
  'THIS_MONTH',
];

function resolveDateRange(
  preset: ExpenseDatePreset,
  todayYmd: string,
  customDateYmd: string,
): { from?: string; to?: string } {
  switch (preset) {
    case 'TODAY':
      return { from: todayYmd, to: todayYmd };
    case 'LAST_7_DAYS':
      return { from: shiftDhakaYmd(todayYmd, -6), to: todayYmd };
    case 'THIS_MONTH':
      return { from: `${todayYmd.slice(0, 7)}-01`, to: todayYmd };
    case 'CUSTOM_DATE':
      return { from: customDateYmd, to: customDateYmd };
    case 'ALL':
    default:
      return {};
  }
}

export default function ExpensesDirectoryScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const todayYmd = getDhakaYmd();
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<ExpenseDatePreset>('ALL');
  const [customDateYmd, setCustomDateYmd] = useState<string>(todayYmd);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, todayYmd, customDateYmd),
    [datePreset, todayYmd, customDateYmd],
  );

  const categoriesQuery = useExpenseCategoriesQuery();
  const expensesQuery = useExpensesQuery({
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
    ...(dateRange.from ? { from: dateRange.from } : {}),
    ...(dateRange.to ? { to: dateRange.to } : {}),
    ...(search.trim().length > 0 ? { q: search.trim() } : {}),
  });

  const categories = useMemo(
    () => (categoriesQuery.data?.categories ?? []).filter((c: ExpenseCategoryDto) => c.isActive),
    [categoriesQuery.data?.categories],
  );
  const expenses = useMemo(
    () => expensesQuery.data?.expenses ?? [],
    [expensesQuery.data?.expenses],
  );
  const totalExpensePoisha = expensesQuery.data?.totalExpensePoisha ?? 0;
  const fromOfflineCache = Boolean(
    expensesQuery.data?.fromOfflineCache || categoriesQuery.data?.fromOfflineCache,
  );

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
          {t('expenses.title')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Button
            label={t('common.back')}
            variant="outline"
            testID="expenses-back-btn"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            }}
          />
        </View>
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {/* Summary + Add Expense */}
      <Card style={{ gap: 10, backgroundColor: Colors.primarySoft, borderColor: '#99F6E4' }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="caption" weight="semibold" color={Colors.primaryPressed}>
              {t('expenses.totalFilteredSummary')}
            </AppText>
            <AppText variant="screenTitle" weight="bold" color={Colors.primaryPressed}>
              {formatMoney(totalExpensePoisha)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {formatDigits(t('expenses.expenseCount', { count: expenses.length }))}
            </AppText>
          </View>
          <Button
            label={t('expenses.addNewButton')}
            testID="expenses-add-new-btn"
            onPress={() =>
              router.push(
                datePreset === 'CUSTOM_DATE'
                  ? `/expenses/form?defaultDate=${encodeURIComponent(customDateYmd)}`
                  : '/expenses/form',
              )
            }
          />
        </View>
      </Card>

      <Input
        placeholder={t('expenses.searchPlaceholder')}
        accessibilityLabel={t('expenses.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />

      {/* Date Presets + Specific Calendar Date */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {DATE_PRESETS.map((preset) => (
            <FilterChip
              key={preset}
              label={t(`expenses.dateFilters.${preset}`)}
              selected={datePreset === preset}
              onPress={() => setDatePreset(preset)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            testID="expenses-specific-date-btn"
            onPress={() => setCalendarOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: datePreset === 'CUSTOM_DATE' ? Colors.primary : Colors.border,
              backgroundColor:
                datePreset === 'CUSTOM_DATE' ? Colors.primarySoft : Colors.surface,
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={15}
              color={datePreset === 'CUSTOM_DATE' ? Colors.primaryPressed : Colors.textSecondary}
            />
            <AppText
              variant="caption"
              weight="semibold"
              color={datePreset === 'CUSTOM_DATE' ? Colors.primaryPressed : Colors.textPrimary}
            >
              {datePreset === 'CUSTOM_DATE'
                ? formatReadableDhakaYmd(customDateYmd, language, digitStyle)
                : t('expenses.pickSpecificDate')}
            </AppText>
          </Pressable>
        </View>

        {datePreset === 'CUSTOM_DATE' ? (
          <View
            testID="expenses-specific-date-bar"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: Colors.surface,
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 6,
              gap: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              testID="expenses-specific-prev-day-btn"
              onPress={() => setCustomDateYmd((d) => shiftDhakaYmd(d, -1))}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: Colors.background,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <Ionicons name="chevron-back" size={16} color={Colors.textPrimary} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setCalendarOpen(true)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}
            >
              <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
                {formatReadableDhakaYmd(customDateYmd, language, digitStyle)}
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              testID="expenses-specific-next-day-btn"
              onPress={() => setCustomDateYmd((d) => shiftDhakaYmd(d, 1))}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: Colors.background,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <Ionicons name="chevron-forward" size={16} color={Colors.textPrimary} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Category Filter Chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <FilterChip
          label={t('expenses.allCategories')}
          selected={selectedCategoryId === ''}
          onPress={() => setSelectedCategoryId('')}
        />
        {categories.map((cat) => (
          <FilterChip
            key={cat.id}
            label={getLocalizedExpenseCategoryName(cat, language)}
            selected={selectedCategoryId === cat.id}
            onPress={() => setSelectedCategoryId((prev) => (prev === cat.id ? '' : cat.id))}
          />
        ))}
      </View>

      {expensesQuery.isLoading ? (
        <LoadingView />
      ) : expensesQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(expensesQuery.error, t)}
          onRetry={() => void expensesQuery.refetch()}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={t('expenses.emptyTitle')}
          description={t('expenses.emptyDesc')}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {expenses.map((expense: ExpenseDto) => {
            const categoryLabel = getLocalizedExpenseCategoryName(
              { nameBn: expense.categoryNameBn, nameEn: expense.categoryNameEn },
              language,
            );
            const methodLabel = getPaymentMethodLabel(expense.method, t);
            return (
              <Pressable
                key={expense.id}
                accessibilityRole="button"
                testID={`expense-card-${expense.id}`}
                onPress={() => router.push(`/expenses/${expense.id}`)}
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
                    <View style={{ flex: 1 }}>
                      <AppText variant="body" weight="bold">
                        {categoryLabel}
                      </AppText>
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {formatDhakaDateTime(expense.incurredAt, language, digitStyle)}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
                        {formatMoney(expense.amountPoisha)}
                      </AppText>
                      <Badge label={methodLabel} tone="neutral" />
                    </View>
                  </View>

                  {expense.note || expense.reference || expense.actorName ? (
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: Colors.border,
                        paddingTop: 6,
                        gap: 2,
                      }}
                    >
                      {expense.note ? (
                        <AppText variant="caption" color={Colors.textPrimary}>
                          {expense.note}
                        </AppText>
                      ) : null}
                      {expense.reference || expense.actorName ? (
                        <AppText variant="caption" color={Colors.textMuted}>
                          {[
                            expense.reference ? formatDigits(expense.reference) : null,
                            expense.actorName
                              ? t('expenses.recordedBy', { name: expense.actorName })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      <CalendarPickerModal
        visible={calendarOpen}
        selectedYmd={customDateYmd}
        onSelectYmd={(ymd) => {
          setCustomDateYmd(ymd);
          setDatePreset('CUSTOM_DATE');
        }}
        onClose={() => setCalendarOpen(false)}
      />
    </ScreenContainer>
  );
}
