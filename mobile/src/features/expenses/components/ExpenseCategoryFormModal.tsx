import { normalizeUnicodeText, type ExpenseCategoryDto } from '@dokanwala/shared';
import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import { AppText, Button, Card, Input } from '@/components';
import { useCreateExpenseCategoryMutation } from '@/features/expenses/hooks/useExpensesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export interface ExpenseCategoryFormModalProps {
  visible: boolean;
  onCreated?: (category: ExpenseCategoryDto) => void;
  onClose: () => void;
}

function ExpenseCategoryFormContent({
  onCreated,
  onClose,
}: Omit<ExpenseCategoryFormModalProps, 'visible'>) {
  const { t } = useAppTranslation();
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateExpenseCategoryMutation();

  const handleSubmit = async () => {
    setFormError(null);
    const cleanNameBn = normalizeUnicodeText(nameBn);
    if (!cleanNameBn) {
      setFormError(t('validation.expenseCategoryNameRequired'));
      return;
    }

    const cleanNameEn = normalizeUnicodeText(nameEn);

    try {
      const res = await createMutation.mutateAsync({
        nameBn: cleanNameBn,
        ...(cleanNameEn.length > 0 ? { nameEn: cleanNameEn } : {}),
      });
      onCreated?.(res.category);
      onClose();
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <View
        style={{
          backgroundColor: Colors.surface,
          borderRadius: Layout.cardRadius,
          padding: 16,
          gap: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {t('expenses.newCategoryModalTitle')}
          </AppText>
          <Button
            label={t('common.cancel')}
            variant="outline"
            disabled={createMutation.isPending}
            onPress={onClose}
          />
        </View>

        {formError ? (
          <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
            <AppText variant="caption" weight="semibold" color={Colors.danger}>
              {formError}
            </AppText>
          </Card>
        ) : null}

        <Input
          label={t('expenses.newCategoryNameBnLabel')}
          accessibilityLabel={t('expenses.newCategoryNameBnLabel')}
          placeholder={t('expenses.newCategoryNameBnPlaceholder')}
          value={nameBn}
          onChangeText={setNameBn}
        />
        <Input
          label={t('expenses.newCategoryNameEnLabel')}
          accessibilityLabel={t('expenses.newCategoryNameEnLabel')}
          placeholder={t('expenses.newCategoryNameEnPlaceholder')}
          value={nameEn}
          onChangeText={setNameEn}
        />

        <Button
          label={t('expenses.saveCategoryButton')}
          fullWidth
          testID="expense-category-submit-btn"
          loading={createMutation.isPending}
          onPress={() => void handleSubmit()}
        />
      </View>
    </View>
  );
}

export function ExpenseCategoryFormModal({
  visible,
  onCreated,
  onClose,
}: ExpenseCategoryFormModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <ExpenseCategoryFormContent key="new-exp-cat" onCreated={onCreated} onClose={onClose} />
      ) : null}
    </Modal>
  );
}
