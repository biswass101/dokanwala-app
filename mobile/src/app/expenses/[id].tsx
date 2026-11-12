import { formatDhakaDateTime, type ExpenseAuditLogDto } from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingView,
  ScreenContainer,
} from '@/components';
import { getLocalizedExpenseCategoryName } from '@/features/customers/utils/customer-format';
import {
  useExpenseDetailQuery,
  useExpenseHistoryQuery,
} from '@/features/expenses/hooks/useExpensesQueries';
import { getPaymentMethodLabel } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function ExpenseDetailScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const expenseId = typeof params.id === 'string' ? params.id : undefined;

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const detailQuery = useExpenseDetailQuery(expenseId);
  const historyQuery = useExpenseHistoryQuery(expenseId);

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.expense) {
    return (
      <ScreenContainer>
        <ErrorState
          message={
            detailQuery.isError
              ? getLocalizedErrorMessage(detailQuery.error, t)
              : t('errors.RESOURCE_NOT_FOUND')
          }
          onRetry={() => void detailQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  const expense = detailQuery.data.expense;
  const fromOfflineCache = Boolean(
    detailQuery.data.fromOfflineCache || historyQuery.data?.fromOfflineCache,
  );
  const categoryLabel = getLocalizedExpenseCategoryName(
    { nameBn: expense.categoryNameBn, nameEn: expense.categoryNameEn },
    language,
  );
  const methodLabel = getPaymentMethodLabel(expense.method, t);
  const auditLogs: ExpenseAuditLogDto[] = historyQuery.data?.history ?? [];

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('expenses.detailTitle')}
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

      {/* Expense Summary Card */}
      <Card style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {categoryLabel}
          </AppText>
          <Badge label={methodLabel} tone="primary" />
        </View>

        <AppText variant="screenTitle" weight="bold" color={Colors.danger}>
          {formatMoney(expense.amountPoisha)}
        </AppText>

        <View
          style={{
            gap: 4,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingTop: 8,
          }}
        >
          <AppText variant="body" color={Colors.textSecondary}>
            {formatDhakaDateTime(expense.incurredAt, language, digitStyle)}
          </AppText>
          {expense.reference ? (
            <AppText variant="body" color={Colors.textPrimary}>
              {t('expenses.referenceLabel')}: {formatDigits(expense.reference)}
            </AppText>
          ) : null}
          {expense.note ? (
            <AppText variant="body" color={Colors.textPrimary}>
              {t('expenses.noteLabel')}: {expense.note}
            </AppText>
          ) : null}
          {expense.actorName ? (
            <AppText variant="caption" color={Colors.textMuted}>
              {t('expenses.recordedBy', { name: expense.actorName })}
            </AppText>
          ) : null}
        </View>
      </Card>

      {/* Owner Edit & Audit History vs Employee Notice */}
      {isOwner ? (
        <>
          <Button
            label={t('expenses.editButton')}
            fullWidth
            testID="expense-edit-btn"
            onPress={() => router.push(`/expenses/form?expenseId=${expense.id}`)}
          />

          <Card style={{ gap: 10 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('expenses.auditHistoryTitle')}
            </AppText>

            {historyQuery.isLoading ? (
              <LoadingView />
            ) : historyQuery.isError ? (
              <ErrorState
                message={getLocalizedErrorMessage(historyQuery.error, t)}
                onRetry={() => void historyQuery.refetch()}
              />
            ) : auditLogs.length === 0 ? (
              <AppText variant="body" color={Colors.textSecondary}>
                {t('expenses.auditEmpty')}
              </AppText>
            ) : (
              auditLogs.map((log) => {
                const before = log.beforeJson;
                const after = log.afterJson;
                const amountChanged = Boolean(before && before.amountPoisha !== after.amountPoisha);
                const categoryChanged = Boolean(before && before.categoryId !== after.categoryId);
                const methodChanged = Boolean(before && before.method !== after.method);
                const noteChanged = Boolean(before && (before.note ?? '') !== (after.note ?? ''));

                return (
                  <View
                    key={log.id}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: Colors.border,
                      paddingTop: 10,
                      gap: 4,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Badge
                        label={t(`expenses.auditActions.${log.action}`)}
                        tone={log.action === 'CREATED' ? 'success' : 'warning'}
                      />
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {formatDhakaDateTime(log.occurredAt, language, digitStyle)}
                      </AppText>
                    </View>

                    {log.editedByName ? (
                      <AppText variant="caption" weight="semibold" color={Colors.textPrimary}>
                        {t('expenses.auditBy', { name: log.editedByName })}
                      </AppText>
                    ) : null}

                    {log.reason ? (
                      <AppText variant="caption" color={Colors.primaryPressed}>
                        {t('expenses.auditReason', { reason: log.reason })}
                      </AppText>
                    ) : null}

                    {before ? (
                      <View style={{ gap: 2 }}>
                        {amountChanged ? (
                          <AppText variant="caption" color={Colors.textSecondary}>
                            {t('expenses.auditAmountChange', {
                              before: formatMoney(before.amountPoisha),
                              after: formatMoney(after.amountPoisha),
                            })}
                          </AppText>
                        ) : null}
                        {categoryChanged ? (
                          <AppText variant="caption" color={Colors.textSecondary}>
                            {t('expenses.auditCategoryChange', {
                              before: before.categoryNameBn,
                              after: after.categoryNameBn,
                            })}
                          </AppText>
                        ) : null}
                        {methodChanged ? (
                          <AppText variant="caption" color={Colors.textSecondary}>
                            {t('expenses.auditMethodChange', {
                              before: getPaymentMethodLabel(before.method, t),
                              after: getPaymentMethodLabel(after.method, t),
                            })}
                          </AppText>
                        ) : null}
                        {noteChanged ? (
                          <AppText variant="caption" color={Colors.textSecondary}>
                            {before.note ?? '—'} → {after.note ?? '—'}
                          </AppText>
                        ) : null}
                      </View>
                    ) : (
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {after.categoryNameBn} • {formatMoney(after.amountPoisha)} •{' '}
                        {getPaymentMethodLabel(after.method, t)}
                      </AppText>
                    )}
                  </View>
                );
              })
            )}
          </Card>
        </>
      ) : (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 12 }}>
          <AppText variant="body" weight="semibold" color={Colors.warning}>
            {t('expenses.ownerOnlyHistoryNote')}
          </AppText>
        </Card>
      )}
    </ScreenContainer>
  );
}
