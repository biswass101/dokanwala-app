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
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingView,
  NumericInput,
  ScreenContainer,
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

interface ExpenseFormInnerProps {
  initialExpense: ExpenseDto | null;
  categories: ExpenseCategoryDto[];
  isOwner: boolean;
}

function ExpenseFormInner({ initialExpense, categories, isOwner }: ExpenseFormInnerProps) {
  const { t, language } = useAppTranslation();
  const { digitStyle } = useFormattedMoney();
  const router = useRouter();
  const isEditing = Boolean(initialExpense);

  const initialAmount = poishaToInputStrings(initialExpense?.amountPoisha ?? 0, digitStyle);
  const initialYmd = initialExpense ? getDhakaYmd(initialExpense.incurredAt) : getDhakaYmd();

  const [categoryOverrideId, setCategoryOverrideId] = useState<string | null>(null);
  const [amountAscii, setAmountAscii] = useState(initialAmount.ascii);
  const [amountRaw, setAmountRaw] = useState(initialAmount.raw);
  const [method, setMethod] = useState<PaymentMethod>(initialExpense?.method ?? 'CASH');
  const [dateYmd, setDateYmd] = useState(
    digitStyle === 'bn' ? toBanglaDigits(initialYmd) : initialYmd,
  );
  const [reference, setReference] = useState(initialExpense?.reference ?? '');
  const [note, setNote] = useState(initialExpense?.note ?? '');
  const [reason, setReason] = useState('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastCreateAttempt, setLastCreateAttempt] = useState<{
    hash: string;
    key: string;
  } | null>(null);

  const createMutation = useCreateExpenseMutation();
  const updateMutation = useUpdateExpenseMutation(initialExpense?.id ?? '');

  const selectedCategoryId =
    categoryOverrideId ?? initialExpense?.categoryId ?? categories[0]?.id ?? '';
  const isSaving = createMutation.isPending || updateMutation.isPending;

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

  const handleSubmit = async () => {
    setFormError(null);

    if (!selectedCategoryId) {
      setFormError(t('validation.expenseCategoryRequired'));
      return;
    }

    const trimmedAmount = amountAscii.trim();
    if (!trimmedAmount) {
      setFormError(t('validation.expenseAmountRequired'));
      return;
    }

    let amountPoisha: number;
    try {
      amountPoisha = bdtToPoisha(trimmedAmount);
    } catch {
      setFormError(t('validation.expenseAmountRequired'));
      return;
    }

    if (amountPoisha <= 0) {
      setFormError(t('validation.expenseAmountRequired'));
      return;
    }

    const cleanYmd = toEnglishDigits(dateYmd.trim());
    if (!isValidYmd(cleanYmd)) {
      setFormError(t('validation.expenseDateInvalid'));
      return;
    }

    const cleanRef = normalizeUnicodeText(reference);
    const cleanNote = normalizeUnicodeText(note);
    const cleanReason = normalizeUnicodeText(reason);

    if (initialExpense) {
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

    const todayYmd = getDhakaYmd();
    const incurredAt =
      cleanYmd === todayYmd ? new Date().toISOString() : `${cleanYmd}T12:00:00+06:00`;

    const payload = {
      categoryId: selectedCategoryId,
      amountPoisha,
      method,
      ...(cleanRef.length > 0 ? { reference: cleanRef } : {}),
      ...(cleanNote.length > 0 ? { note: cleanNote } : {}),
      incurredAt,
    };

    const hash = JSON.stringify({
      categoryId: payload.categoryId,
      amountPoisha: payload.amountPoisha,
      method: payload.method,
      reference: cleanRef,
      note: cleanNote,
      dateYmd: cleanYmd,
    });
    const idempotencyKey =
      lastCreateAttempt?.hash === hash ? lastCreateAttempt.key : Crypto.randomUUID();
    setLastCreateAttempt({ hash, key: idempotencyKey });

    try {
      const res = await createMutation.mutateAsync({ payload, idempotencyKey });
      router.replace(`/expenses/${res.expense.id}`);
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {isEditing ? t('expenses.editTitle') : t('expenses.createTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {formError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 12 }}>
          <AppText variant="body" weight="semibold" color={Colors.danger}>
            {formError}
          </AppText>
        </Card>
      ) : null}

      {/* Category Picker */}
      <Card style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AppText variant="sectionTitle" weight="semibold">
            {t('expenses.categoryLabel')}
          </AppText>
          {isOwner ? (
            <Button
              label={t('expenses.addCategoryButton')}
              variant="outline"
              testID="expense-add-category-btn"
              onPress={() => setCategoryModalOpen(true)}
            />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {selectableCategories.map((cat) => (
            <FilterChip
              key={cat.id}
              label={getLocalizedExpenseCategoryName(cat, language)}
              selected={selectedCategoryId === cat.id}
              onPress={() => setCategoryOverrideId(cat.id)}
            />
          ))}
        </View>
      </Card>

      {/* Amount, Method & Date */}
      <Card style={{ gap: 12 }}>
        <NumericInput
          label={t('expenses.amountLabel')}
          accessibilityLabel={t('expenses.amountLabel')}
          placeholder={digitStyle === 'bn' ? '২৫০' : '250'}
          value={amountRaw}
          onChangeNormalized={(ascii, raw) => {
            setAmountAscii(ascii);
            setAmountRaw(raw);
          }}
        />

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

        <View style={{ gap: 8 }}>
          <Input
            label={t('expenses.dateLabel')}
            accessibilityLabel={t('expenses.dateLabel')}
            placeholder="YYYY-MM-DD"
            value={dateYmd}
            onChangeText={setDateYmd}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t('expenses.dateQuickToday')}
              variant="outline"
              onPress={() => {
                const today = getDhakaYmd();
                setDateYmd(digitStyle === 'bn' ? toBanglaDigits(today) : today);
              }}
            />
            <Button
              label={t('expenses.dateQuickYesterday')}
              variant="outline"
              onPress={() => {
                const yesterday = shiftDhakaYmd(getDhakaYmd(), -1);
                setDateYmd(digitStyle === 'bn' ? toBanglaDigits(yesterday) : yesterday);
              }}
            />
          </View>
        </View>

        <Input
          label={t('expenses.referenceLabel')}
          accessibilityLabel={t('expenses.referenceLabel')}
          placeholder={t('expenses.referencePlaceholder')}
          value={reference}
          onChangeText={setReference}
        />

        <Input
          label={t('expenses.noteLabel')}
          accessibilityLabel={t('expenses.noteLabel')}
          placeholder={t('expenses.notePlaceholder')}
          value={note}
          onChangeText={setNote}
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

      <Button
        label={isEditing ? t('expenses.submitEditButton') : t('expenses.submitCreateButton')}
        fullWidth
        testID="expense-submit-btn"
        loading={isSaving}
        onPress={() => void handleSubmit()}
      />

      <ExpenseCategoryFormModal
        visible={categoryModalOpen}
        onCreated={(cat) => setCategoryOverrideId(cat.id)}
        onClose={() => setCategoryModalOpen(false)}
      />
    </ScreenContainer>
  );
}

export default function ExpenseFormScreen() {
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ expenseId?: string }>();
  const expenseId = typeof params.expenseId === 'string' ? params.expenseId : undefined;
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
  const formKey = initialExpense
    ? `${initialExpense.id}:${String(initialExpense.version)}`
    : 'new-expense';

  return (
    <ExpenseFormInner
      key={formKey}
      initialExpense={initialExpense}
      categories={activeCategories}
      isOwner={isOwner}
    />
  );
}
