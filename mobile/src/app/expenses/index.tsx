import {
  formatDhakaDateTime,
  getDhakaYmd,
  shiftDhakaYmd,
  type ExpenseCategoryDto,
  type ExpenseDto,
} from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
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

type ExpenseDatePreset = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH';

const DATE_PRESETS: ExpenseDatePreset[] = ['ALL', 'TODAY', 'LAST_7_DAYS', 'THIS_MONTH'];

function resolveDateRange(
  preset: ExpenseDatePreset,
  todayYmd: string,
): { from?: string; to?: string } {
  switch (preset) {
    case 'TODAY':
      return { from: todayYmd, to: todayYmd };
    case 'LAST_7_DAYS':
      return { from: shiftDhakaYmd(todayYmd, -6), to: todayYmd };
    case 'THIS_MONTH':
      return { from: `${todayYmd.slice(0, 7)}-01`, to: todayYmd };
    case 'ALL':
    default:
      return {};
  }
}

export default function ExpensesDirectoryScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<ExpenseDatePreset>('ALL');

  const todayYmd = getDhakaYmd();
  const dateRange = useMemo(() => resolveDateRange(datePreset, todayYmd), [datePreset, todayYmd]);

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
          <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
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
            onPress={() => router.push('/expenses/form')}
          />
        </View>
      </Card>

      <Input
        placeholder={t('expenses.searchPlaceholder')}
        accessibilityLabel={t('expenses.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />

      {/* Date Presets */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DATE_PRESETS.map((preset) => (
          <FilterChip
            key={preset}
            label={t(`expenses.dateFilters.${preset}`)}
            selected={datePreset === preset}
            onPress={() => setDatePreset(preset)}
          />
        ))}
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
    </ScreenContainer>
  );
}
