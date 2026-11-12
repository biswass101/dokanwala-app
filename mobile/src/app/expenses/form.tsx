import {
  bdtToPoisha,
  getDhakaYmd,
  normalizeUnicodeText,
  poishaToBdtString,
  shiftDhakaYmd,
  toBanglaDigits,
  toEnglishDigits,
  type DigitStyle,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type PaymentMethod,
} from '@dokanwala/shared';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  CalendarPickerModal,
  Card,
  ErrorState,
  Input,
  LoadingView,
  NumericInput,
  ScreenContainer,
  formatReadableDhakaYmd,
} from '@/components';
import { getLocalizedExpenseCategoryName } from '@/features/customers/utils/customer-format';
import { ExpenseCategoryFormModal } from '@/features/expenses/components/ExpenseCategoryFormModal';
import {
  useCreateExpenseMutation,
  useExpenseCategoriesQuery,
  useExpenseDetailQuery,
  useUpdateExpenseMutation,
} from '@/features/expenses/hooks/useExpensesQueries';
import { FilterChip } from '@/features/products/components/FilterChip';
import { OwnerOnlyScreen } from '@/features/purchases/components/OwnerOnlyScreen';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'OTHER'];

interface ExpenseDraftRow {
  localId: string;
  categoryOverrideId: string | null;
  amountAscii: string;
  amountRaw: string;
  note: string;
  attemptHash?: string;
  attemptKey?: string;
  savedExpense?: ExpenseDto;
}

function poishaToInputStrings(
  poisha: number,
  digitStyle: DigitStyle,
): { ascii: string; raw: string } {
  if (poisha <= 0) return { ascii: '', raw: '' };
  const rawBdt = poishaToBdtString(poisha, 2);
  const ascii = rawBdt.endsWith('.00') ? rawBdt.slice(0, -3) : rawBdt;
  return {
    ascii,
    raw: digitStyle === 'bn' ? toBanglaDigits(ascii) : ascii,
  };
}

function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  try {
    const parsed = new Date(`${ymd}T12:00:00+06:00`);
    return !Number.isNaN(parsed.getTime()) && getDhakaYmd(parsed) === ymd;
  } catch {
    return false;
  }
}

function tryParsePositivePoisha(amountAscii: string): number | null {
  const trimmed = amountAscii.trim();
  if (!trimmed) return null;
  try {
    const poisha = bdtToPoisha(trimmed);
    return poisha > 0 ? poisha : null;
  } catch {
    return null;
  }
}

function createDraftRow(categoryOverrideId: string | null = null): ExpenseDraftRow {
  return {
    localId: Crypto.randomUUID(),
    categoryOverrideId,
    amountAscii: '',
    amountRaw: '',
    note: '',
  };
}

interface ExpenseFormInnerProps {
  initialExpense: ExpenseDto | null;
  initialDefaultDate: string;
  categories: ExpenseCategoryDto[];
  isOwner: boolean;
}

function ExpenseFormInner({
  initialExpense,
  initialDefaultDate,
  categories,
  isOwner,
}: ExpenseFormInnerProps) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const isEditing = Boolean(initialExpense);

  const initialAmount = poishaToInputStrings(initialExpense?.amountPoisha ?? 0, digitStyle);

  const [rows, setRows] = useState<ExpenseDraftRow[]>(() => [
    initialExpense
      ? {
          localId: 'edit-row',
          categoryOverrideId: initialExpense.categoryId,
          amountAscii: initialAmount.ascii,
          amountRaw: initialAmount.raw,
          note: initialExpense.note ?? '',
        }
      : createDraftRow(categories[0]?.id ?? null),
  ]);
  const [method, setMethod] = useState<PaymentMethod>(initialExpense?.method ?? 'CASH');
  const [dateYmd, setDateYmd] = useState(initialDefaultDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [reference, setReference] = useState(initialExpense?.reference ?? '');
  const [reason, setReason] = useState('');
  const [categoryModalTargetIdx, setCategoryModalTargetIdx] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedBatch, setSavedBatch] = useState<ExpenseDto[] | null>(null);
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  const createMutation = useCreateExpenseMutation();
  const updateMutation = useUpdateExpenseMutation(initialExpense?.id ?? '');

  const isSaving = isBatchSaving || createMutation.isPending || updateMutation.isPending;

  const selectableCategories = useMemo(() => {
    if (!initialExpense) return categories;
    const exists = categories.some((c) => c.id === initialExpense.categoryId);
    if (exists) return categories;
    return [
      {
        id: initialExpense.categoryId,
        shopId: initialExpense.shopId,
        nameBn: initialExpense.categoryNameBn,
        nameEn: initialExpense.categoryNameEn,
        isDefault: false,
        sortOrder: 0,
        isActive: true,
        version: 1,
        createdAt: initialExpense.createdAt,
        updatedAt: initialExpense.updatedAt,
      },
      ...categories,
    ];
  }, [categories, initialExpense]);

  const fallbackCategoryId = categories[0]?.id ?? '';

  const totalBatchPoisha = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const parsed = tryParsePositivePoisha(row.amountAscii);
        return sum + (parsed ?? 0);
      }, 0),
    [rows],
  );

  const updateRow = (idx: number, updater: (prev: ExpenseDraftRow) => ExpenseDraftRow) => {
    setRows((prev) => prev.map((row, i) => (i === idx ? updater(row) : row)));
  };

  const handleAddRow = () => {
    const lastCategory =
      rows[rows.length - 1]?.categoryOverrideId ?? (fallbackCategoryId || null);
    setRows((prev) => [...prev, createDraftRow(lastCategory)]);
  };

  const handleRemoveRow = (idx: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleBackFromForm = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/expenses');
  };

  const handleSubmit = async () => {
    setFormError(null);

    const cleanYmd = toEnglishDigits(dateYmd.trim());
    if (!isValidYmd(cleanYmd)) {
      setFormError(t('validation.expenseDateInvalid'));
      return;
    }

    const cleanRef = normalizeUnicodeText(reference);
    const cleanReason = normalizeUnicodeText(reason);

    if (initialExpense) {
      const row = rows[0];
      if (!row) return;
      const selectedCategoryId = row.categoryOverrideId ?? initialExpense.categoryId;
      if (!selectedCategoryId) {
        setFormError(t('validation.expenseCategoryRequired'));
        return;
      }
      const amountPoisha = tryParsePositivePoisha(row.amountAscii);
      if (!amountPoisha) {
        setFormError(t('validation.expenseAmountRequired'));
        return;
      }

      const cleanNote = normalizeUnicodeText(row.note);
      const initialDate = getDhakaYmd(initialExpense.incurredAt);
      const incurredAtChanged = cleanYmd !== initialDate;
      const nextIncurredAt = incurredAtChanged
        ? cleanYmd === getDhakaYmd()
          ? new Date().toISOString()
          : `${cleanYmd}T12:00:00+06:00`
        : initialExpense.incurredAt;

      const hasChanged =
        selectedCategoryId !== initialExpense.categoryId ||
        amountPoisha !== initialExpense.amountPoisha ||
        method !== initialExpense.method ||
        (cleanRef.length > 0 ? cleanRef : null) !== (initialExpense.reference ?? null) ||
        (cleanNote.length > 0 ? cleanNote : null) !== (initialExpense.note ?? null) ||
        incurredAtChanged;

      if (!hasChanged) {
        setFormError(t('validation.expenseNoChanges'));
        return;
      }

      try {
        await updateMutation.mutateAsync({
          categoryId: selectedCategoryId,
          amountPoisha,
          method,
          reference: cleanRef.length > 0 ? cleanRef : null,
          note: cleanNote.length > 0 ? cleanNote : null,
          ...(incurredAtChanged ? { incurredAt: nextIncurredAt } : {}),
          ...(cleanReason.length > 0 ? { reason: cleanReason } : {}),
          expectedVersion: initialExpense.version,
        });
        router.back();
      } catch (err) {
        setFormError(getLocalizedErrorMessage(err, t));
      }
      return;
    }

    // Validate all draft items before sending any create request
    const validatedRows: {
      idx: number;
      categoryId: string;
      amountPoisha: number;
      cleanNote: string;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const categoryId = row.categoryOverrideId ?? fallbackCategoryId;
      if (!categoryId) {
        setFormError(
          rows.length > 1
            ? `${t('expenses.itemRowTitle', { index: formatDigits(String(i + 1)) })}: ${t('validation.expenseCategoryRequired')}`
            : t('validation.expenseCategoryRequired'),
        );
        return;
      }
      const amountPoisha = tryParsePositivePoisha(row.amountAscii);
      if (!amountPoisha) {
        setFormError(
          rows.length > 1
            ? `${t('expenses.itemRowTitle', { index: formatDigits(String(i + 1)) })}: ${t('validation.expenseAmountRequired')}`
            : t('validation.expenseAmountRequired'),
        );
        return;
      }
      validatedRows.push({
        idx: i,
        categoryId,
        amountPoisha,
        cleanNote: normalizeUnicodeText(row.note),
      });
    }

    const todayYmd = getDhakaYmd();
    const incurredAt =
      cleanYmd === todayYmd ? new Date().toISOString() : `${cleanYmd}T12:00:00+06:00`;

    setIsBatchSaving(true);
    const workingRows = [...rows];
    const completedExpenses: ExpenseDto[] = [];

    try {
      for (const item of validatedRows) {
        const currentRow = workingRows[item.idx];
        if (!currentRow) continue;

        if (currentRow.savedExpense) {
          completedExpenses.push(currentRow.savedExpense);
          continue;
        }

        const payload = {
          categoryId: item.categoryId,
          amountPoisha: item.amountPoisha,
          method,
          ...(cleanRef.length > 0 ? { reference: cleanRef } : {}),
          ...(item.cleanNote.length > 0 ? { note: item.cleanNote } : {}),
          incurredAt,
        };

        const hash = JSON.stringify({
          localId: currentRow.localId,
          categoryId: payload.categoryId,
          amountPoisha: payload.amountPoisha,
          method: payload.method,
          reference: cleanRef,
          note: item.cleanNote,
          dateYmd: cleanYmd,
        });
        const idempotencyKey =
          currentRow.attemptHash === hash && currentRow.attemptKey
            ? currentRow.attemptKey
            : Crypto.randomUUID();

        workingRows[item.idx] = {
          ...currentRow,
          attemptHash: hash,
          attemptKey: idempotencyKey,
        };
        setRows([...workingRows]);

        const res = await createMutation.mutateAsync({ payload, idempotencyKey });
        const latestRow = workingRows[item.idx];
        if (latestRow) {
          workingRows[item.idx] = {
            ...latestRow,
            savedExpense: res.expense,
          };
        }
        setRows([...workingRows]);
        completedExpenses.push(res.expense);
      }

      if (completedExpenses.length === 1 && completedExpenses[0]) {
        router.replace(`/expenses/${completedExpenses[0].id}`);
        return;
      }

      setSavedBatch(completedExpenses);
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    } finally {
      setIsBatchSaving(false);
    }
  };

  if (savedBatch && savedBatch.length > 0) {
    const batchTotal = savedBatch.reduce((acc, exp) => acc + exp.amountPoisha, 0);
    const readableDate = formatReadableDhakaYmd(dateYmd, language, digitStyle);

    return (
      <ScreenContainer>
        <View
          testID="expense-batch-summary"
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
            {t('expenses.batchSavedTitle')}
          </AppText>
          <Button
            label={t('common.back')}
            variant="outline"
            testID="expense-batch-header-back-btn"
            onPress={() => router.replace('/expenses')}
          />
        </View>

        <Card style={{ backgroundColor: Colors.successSoft, borderColor: '#BBF7D0', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            <AppText variant="sectionTitle" weight="bold" color={Colors.success}>
              {t('expenses.batchSavedTitle')}
            </AppText>
          </View>
          <AppText variant="body" color={Colors.textPrimary}>
            {t('expenses.batchSavedSubtitle', {
              count: formatDigits(String(savedBatch.length)),
              total: formatMoney(batchTotal),
              date: readableDate,
            })}
          </AppText>
        </Card>

        <View style={{ gap: 8 }}>
          {savedBatch.map((exp) => {
            const catLabel = getLocalizedExpenseCategoryName(
              { nameBn: exp.categoryNameBn, nameEn: exp.categoryNameEn },
              language,
            );
            return (
              <Pressable
                key={exp.id}
                accessibilityRole="button"
                onPress={() => router.push(`/expenses/${exp.id}`)}
              >
                <Card style={{ padding: 12, gap: 4 }}>
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
                        {catLabel}
                      </AppText>
                      {exp.note ? (
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {exp.note}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
                      {formatMoney(exp.amountPoisha)}
                    </AppText>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 10 }}>
          <Button
            label={t('expenses.backToExpensesButton')}
            fullWidth
            testID="expense-batch-back-btn"
            onPress={() => router.replace('/expenses')}
          />
          <Button
            label={t('expenses.addMoreExpensesButton')}
            variant="secondary"
            fullWidth
            testID="expense-batch-add-more-btn"
            onPress={() => {
              setSavedBatch(null);
              setReference('');
              setFormError(null);
              setRows([createDraftRow(fallbackCategoryId || null)]);
            }}
          />
        </View>
      </ScreenContainer>
    );
  }

  const readableSelectedDate = formatReadableDhakaYmd(dateYmd, language, digitStyle);
  const displayYmd = digitStyle === 'bn' ? toBanglaDigits(dateYmd) : dateYmd;

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {isEditing ? t('expenses.editTitle') : t('expenses.createTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={handleBackFromForm} />
      </View>

      {formError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 12 }}>
          <AppText variant="body" weight="semibold" color={Colors.danger}>
            {formError}
          </AppText>
        </Card>
      ) : null}

      {/* Date (opens Calendar), Method & Optional Reference */}
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('expenses.dateLabel')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('expenses.dateLabel')}
            testID="expense-date-picker-btn"
            onPress={() => setCalendarOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.background,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="bold" color={Colors.textPrimary}>
                  {readableSelectedDate}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {displayYmd} • {t('expenses.selectDateHint')}
                </AppText>
              </View>
            </View>
            <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t('expenses.dateQuickToday')}
              variant="outline"
              onPress={() => setDateYmd(getDhakaYmd())}
            />
            <Button
              label={t('expenses.dateQuickYesterday')}
              variant="outline"
              onPress={() => setDateYmd(shiftDhakaYmd(getDhakaYmd(), -1))}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('expenses.methodLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => (
              <FilterChip
                key={m}
                label={t(`sales.paymentMethods.${m}`)}
                selected={method === m}
                onPress={() => setMethod(m)}
              />
            ))}
          </View>
        </View>

        <Input
          label={t('expenses.referenceLabel')}
          accessibilityLabel={t('expenses.referenceLabel')}
          placeholder={t('expenses.referencePlaceholder')}
          value={reference}
          onChangeText={setReference}
        />
      </Card>

      {/* Expense Item Rows (1 in edit mode, 1 or many in create mode) */}
      {rows.map((row, idx) => {
        const selectedCategoryId =
          row.categoryOverrideId ?? initialExpense?.categoryId ?? fallbackCategoryId;
        const isRowSaved = Boolean(row.savedExpense);

        return (
          <Card key={row.localId} style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AppText variant="sectionTitle" weight="semibold" style={{ flex: 1 }}>
                {rows.length > 1
                  ? t('expenses.itemRowTitle', { index: formatDigits(String(idx + 1)) })
                  : t('expenses.categoryLabel')}
              </AppText>
              {isRowSaved ? (
                <Badge label={t('common.savedSuccess')} tone="success" />
              ) : null}
              {!isEditing && rows.length > 1 && !isRowSaved ? (
                <Button
                  label={t('expenses.removeItemButton')}
                  variant="outline"
                  testID={`expense-remove-item-${idx}`}
                  onPress={() => handleRemoveRow(idx)}
                />
              ) : null}
              {isOwner && idx === 0 ? (
                <Button
                  label={t('expenses.addCategoryButton')}
                  variant="outline"
                  testID="expense-add-category-btn"
                  onPress={() => setCategoryModalTargetIdx(idx)}
                />
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {selectableCategories.map((cat) => (
                <FilterChip
                  key={cat.id}
                  label={getLocalizedExpenseCategoryName(cat, language)}
                  selected={selectedCategoryId === cat.id}
                  onPress={() =>
                    updateRow(idx, (prev) => ({ ...prev, categoryOverrideId: cat.id }))
                  }
                />
              ))}
            </View>

            <NumericInput
              label={t('expenses.amountLabel')}
              accessibilityLabel={
                idx === 0
                  ? t('expenses.amountLabel')
                  : `${t('expenses.amountLabel')} #${idx + 1}`
              }
              testID={`expense-amount-input-${idx}`}
              placeholder={digitStyle === 'bn' ? '২৫০' : '250'}
              value={row.amountRaw}
              editable={!isRowSaved}
              onChangeNormalized={(ascii, raw) => {
                updateRow(idx, (prev) => ({
                  ...prev,
                  amountAscii: ascii,
                  amountRaw: raw,
                }));
              }}
            />

            <Input
              label={t('expenses.noteLabel')}
              accessibilityLabel={
                idx === 0 ? t('expenses.noteLabel') : `${t('expenses.noteLabel')} #${idx + 1}`
              }
              testID={`expense-note-input-${idx}`}
              placeholder={t('expenses.notePlaceholder')}
              value={row.note}
              editable={!isRowSaved}
              onChangeText={(text) => {
                updateRow(idx, (prev) => ({ ...prev, note: text }));
              }}
            />

            {isEditing ? (
              <Input
                label={t('expenses.editReasonLabel')}
                accessibilityLabel={t('expenses.editReasonLabel')}
                placeholder={t('expenses.editReasonPlaceholder')}
                value={reason}
                onChangeText={setReason}
              />
            ) : null}
          </Card>
        );
      })}

      {!isEditing ? (
        <Button
          label={t('expenses.addAnotherItemButton')}
          variant="secondary"
          fullWidth
          testID="expense-add-item-btn"
          onPress={handleAddRow}
        />
      ) : null}

      {!isEditing && rows.length > 1 ? (
        <Card
          style={{
            backgroundColor: Colors.primarySoft,
            borderColor: '#99F6E4',
            padding: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
            {t('expenses.batchSummaryBar', {
              count: formatDigits(String(rows.length)),
              total: formatMoney(totalBatchPoisha),
            })}
          </AppText>
        </Card>
      ) : null}

      <Button
        label={
          isEditing
            ? t('expenses.submitEditButton')
            : rows.length > 1
              ? t('expenses.submitCreateBatchButton', {
                  count: formatDigits(String(rows.length)),
                  total: formatMoney(totalBatchPoisha),
                })
              : t('expenses.submitCreateButton')
        }
        fullWidth
        testID="expense-submit-btn"
        loading={isSaving}
        onPress={() => void handleSubmit()}
      />

      <CalendarPickerModal
        visible={calendarOpen}
        selectedYmd={dateYmd}
        onSelectYmd={(ymd) => setDateYmd(ymd)}
        onClose={() => setCalendarOpen(false)}
      />

      <ExpenseCategoryFormModal
        visible={categoryModalTargetIdx !== null}
        onCreated={(cat) => {
          const target = categoryModalTargetIdx ?? 0;
          updateRow(target, (prev) => ({ ...prev, categoryOverrideId: cat.id }));
        }}
        onClose={() => setCategoryModalTargetIdx(null)}
      />
    </ScreenContainer>
  );
}

export default function ExpenseFormScreen() {
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ expenseId?: string; defaultDate?: string }>();
  const expenseId = typeof params.expenseId === 'string' ? params.expenseId : undefined;
  const paramDate =
    typeof params.defaultDate === 'string' && isValidYmd(toEnglishDigits(params.defaultDate))
      ? toEnglishDigits(params.defaultDate)
      : undefined;

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const categoriesQuery = useExpenseCategoriesQuery();
  const expenseDetailQuery = useExpenseDetailQuery(expenseId);

  const activeCategories = useMemo(
    () => (categoriesQuery.data?.categories ?? []).filter((c: ExpenseCategoryDto) => c.isActive),
    [categoriesQuery.data?.categories],
  );

  if (expenseId && !isOwner) {
    return (
      <OwnerOnlyScreen
        title={t('expenses.editTitle')}
        description={t('expenses.ownerOnlyHistoryNote')}
      />
    );
  }

  if (categoriesQuery.isLoading || (expenseId && expenseDetailQuery.isLoading)) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (categoriesQuery.isError) {
    return (
      <ScreenContainer>
        <ErrorState
          message={getLocalizedErrorMessage(categoriesQuery.error, t)}
          onRetry={() => void categoriesQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  if (expenseId && (expenseDetailQuery.isError || !expenseDetailQuery.data?.expense)) {
    return (
      <ScreenContainer>
        <ErrorState
          message={
            expenseDetailQuery.isError
              ? getLocalizedErrorMessage(expenseDetailQuery.error, t)
              : t('errors.RESOURCE_NOT_FOUND')
          }
          onRetry={() => void expenseDetailQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  const initialExpense = expenseDetailQuery.data?.expense ?? null;
  const initialDefaultDate = initialExpense
    ? getDhakaYmd(initialExpense.incurredAt)
    : (paramDate ?? getDhakaYmd());
  const formKey = initialExpense
    ? `${initialExpense.id}:${String(initialExpense.version)}`
    : `new-expense:${initialDefaultDate}`;

  return (
    <ExpenseFormInner
      key={formKey}
      initialExpense={initialExpense}
      initialDefaultDate={initialDefaultDate}
      categories={activeCategories}
      isOwner={isOwner}
    />
  );
}
