import { normalizeBdPhone, normalizeUnicodeText, type SupplierDto } from '@dokanwala/shared';
import React, { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { AppText, Button, Card, Input } from '@/components';
import {
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
} from '@/features/purchases/hooks/usePurchasesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export interface SupplierFormModalProps {
  visible: boolean;
  supplier: SupplierDto | null;
  onSaved?: (supplier: SupplierDto) => void;
  onClose: () => void;
}

function SupplierFormContent({
  supplier,
  onSaved,
  onClose,
}: Omit<SupplierFormModalProps, 'visible'>) {
  const { t } = useAppTranslation();
  const isEditing = supplier !== null;

  const [nameBn, setNameBn] = useState(supplier?.nameBn ?? '');
  const [nameEn, setNameEn] = useState(supplier?.nameEn ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [note, setNote] = useState(supplier?.note ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateSupplierMutation();
  const updateMutation = useUpdateSupplierMutation(supplier?.id ?? '');
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    setFormError(null);
    const cleanNameBn = normalizeUnicodeText(nameBn);
    if (!cleanNameBn) {
      setFormError(t('validation.supplierNameRequired'));
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
          expectedVersion: supplier.version,
        });
        onSaved?.(res.supplier);
      } else {
        const res = await createMutation.mutateAsync({
          nameBn: cleanNameBn,
          ...(cleanNameEn.length > 0 ? { nameEn: cleanNameEn } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          ...(cleanAddress.length > 0 ? { address: cleanAddress } : {}),
          ...(cleanNote.length > 0 ? { note: cleanNote } : {}),
        });
        onSaved?.(res.supplier);
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
            {isEditing ? t('suppliers.editTitle') : t('suppliers.createTitle')}
          </AppText>
          <Button
            label={t('common.cancel')}
            variant="outline"
            testID="supplier-form-close-btn"
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
            label={t('suppliers.nameBnLabel')}
            placeholder={t('suppliers.nameBnPlaceholder')}
            value={nameBn}
            onChangeText={setNameBn}
          />
          <Input
            label={t('suppliers.nameEnLabel')}
            placeholder={t('suppliers.nameEnPlaceholder')}
            value={nameEn}
            onChangeText={setNameEn}
          />
          <Input
            label={t('suppliers.phoneLabel')}
            placeholder={t('suppliers.phonePlaceholder')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Input
            label={t('suppliers.addressLabel')}
            placeholder={t('suppliers.addressPlaceholder')}
            value={address}
            onChangeText={setAddress}
          />
          <Input
            label={t('suppliers.noteLabel')}
            placeholder={t('suppliers.notePlaceholder')}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        <Button
          label={t('suppliers.saveButton')}
          fullWidth
          testID="supplier-form-submit-btn"
          loading={isSaving}
          onPress={() => void handleSubmit()}
        />
      </View>
    </View>
  );
}

export function SupplierFormModal({ visible, supplier, onSaved, onClose }: SupplierFormModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <SupplierFormContent
          key={supplier?.id ?? 'new'}
          supplier={supplier}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
