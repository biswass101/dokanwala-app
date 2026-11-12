import { normalizeBdPhone, normalizeUnicodeText, type CustomerDto } from '@dokanwala/shared';
import React, { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { AppText, Button, Card, Input } from '@/components';
import { useUpdateCustomerMutation } from '@/features/customers/hooks/useCustomersQueries';
import { useCreateCustomerMutation } from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export interface CustomerFormModalProps {
  visible: boolean;
  customer: CustomerDto | null;
  onSaved?: (customer: CustomerDto) => void;
  onClose: () => void;
}

function CustomerFormContent({
  customer,
  onSaved,
  onClose,
}: Omit<CustomerFormModalProps, 'visible'>) {
  const { t } = useAppTranslation();
  const isEditing = customer !== null;

  const [nameBn, setNameBn] = useState(customer?.nameBn ?? '');
  const [nameEn, setNameEn] = useState(customer?.nameEn ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [note, setNote] = useState(customer?.note ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateCustomerMutation();
  const updateMutation = useUpdateCustomerMutation(customer?.id ?? '');
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    setFormError(null);
    const cleanNameBn = normalizeUnicodeText(nameBn);
    if (!cleanNameBn) {
      setFormError(t('validation.customerNameRequired'));
      return;
    }

    const trimmedPhone = phone.trim();
    let normalizedPhone: string | null = null;
    if (trimmedPhone.length > 0) {
      const checked = normalizeBdPhone(trimmedPhone);
      if (!checked) {
        setFormError(t('validation.invalidPhone'));
        return;
      }
      normalizedPhone = checked;
    }

    const cleanNameEn = normalizeUnicodeText(nameEn);
    const cleanAddress = normalizeUnicodeText(address);
    const cleanNote = normalizeUnicodeText(note);

    try {
      if (isEditing) {
        const res = await updateMutation.mutateAsync({
          nameBn: cleanNameBn,
          nameEn: cleanNameEn.length > 0 ? cleanNameEn : null,
          phone: normalizedPhone,
          address: cleanAddress.length > 0 ? cleanAddress : null,
          note: cleanNote.length > 0 ? cleanNote : null,
          expectedVersion: customer.version,
        });
        onSaved?.(res.customer);
      } else {
        const res = await createMutation.mutateAsync({
          nameBn: cleanNameBn,
          ...(cleanNameEn.length > 0 ? { nameEn: cleanNameEn } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          ...(cleanAddress.length > 0 ? { address: cleanAddress } : {}),
          ...(cleanNote.length > 0 ? { note: cleanNote } : {}),
        });
        onSaved?.(res.customer);
      }
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
          maxHeight: '90%',
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {isEditing ? t('customers.editTitle') : t('customers.createTitle')}
          </AppText>
          <Button
            label={t('common.cancel')}
            variant="outline"
            testID="customer-form-close-btn"
            disabled={isSaving}
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

        <ScrollView contentContainerStyle={{ gap: 10 }}>
          <Input
            label={t('customers.nameBnLabel')}
            accessibilityLabel={t('customers.nameBnLabel')}
            placeholder={t('customers.nameBnPlaceholder')}
            value={nameBn}
            onChangeText={setNameBn}
          />
          <Input
            label={t('customers.nameEnLabel')}
            accessibilityLabel={t('customers.nameEnLabel')}
            placeholder={t('customers.nameEnPlaceholder')}
            value={nameEn}
            onChangeText={setNameEn}
          />
          <Input
            label={t('customers.phoneLabel')}
            accessibilityLabel={t('customers.phoneLabel')}
            placeholder={t('customers.phonePlaceholder')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Input
            label={t('customers.addressLabel')}
            accessibilityLabel={t('customers.addressLabel')}
            placeholder={t('customers.addressPlaceholder')}
            value={address}
            onChangeText={setAddress}
          />
          <Input
            label={t('customers.noteLabel')}
            accessibilityLabel={t('customers.noteLabel')}
            placeholder={t('customers.notePlaceholder')}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        <Button
          label={t('customers.saveButton')}
          fullWidth
          testID="customer-form-submit-btn"
          loading={isSaving}
          onPress={() => void handleSubmit()}
        />
      </View>
    </View>
  );
}

export function CustomerFormModal({ visible, customer, onSaved, onClose }: CustomerFormModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <CustomerFormContent
          key={customer?.id ?? 'new'}
          customer={customer}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
