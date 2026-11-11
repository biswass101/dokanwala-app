import { normalizeBdPhone, normalizeUnicodeText, type SupplierDto } from '@dokanwala/shared';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText, Badge, Button, Card, Input, LoadingView } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useCreateSupplierMutation,
  useSuppliersQuery,
} from '@/features/purchases/hooks/usePurchasesQueries';
import { getLocalizedSupplierName } from '@/features/purchases/utils/purchase-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export interface SupplierPickerModalProps {
  visible: boolean;
  selectedSupplierId?: string | null;
  onSelect: (supplier: SupplierDto | null) => void;
  onClose: () => void;
}

function SupplierPickerContent({
  selectedSupplierId,
  onSelect,
  onClose,
}: Omit<SupplierPickerModalProps, 'visible'>) {
  const { t, language } = useAppTranslation();
  const { formatMoney } = useFormattedMoney();

  const [search, setSearch] = useState('');
  const [withPayablesOnly, setWithPayablesOnly] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [nameBn, setNameBn] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const suppliersQuery = useSuppliersQuery({
    ...(search.trim().length > 0 ? { q: search.trim() } : {}),
    withPayablesOnly,
  });
  const createSupplierMutation = useCreateSupplierMutation();

  const suppliers = suppliersQuery.data?.suppliers ?? [];

  const handleCreateSubmit = async () => {
    setFormError(null);
    const cleanName = normalizeUnicodeText(nameBn);
    if (!cleanName) {
      setFormError(t('validation.supplierNameRequired'));
      return;
    }

    const trimmedPhone = phone.trim();
    let normalizedPhone: string | undefined;
    if (trimmedPhone.length > 0) {
      const checked = normalizeBdPhone(trimmedPhone);
      if (!checked) {
        setFormError(t('validation.invalidPhone'));
        return;
      }
      normalizedPhone = checked;
    }

    const cleanAddress = normalizeUnicodeText(address);

    try {
      const res = await createSupplierMutation.mutateAsync({
        nameBn: cleanName,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(cleanAddress.length > 0 ? { address: cleanAddress } : {}),
      });
      onSelect(res.supplier);
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
        {/* Header */}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {t('suppliers.pickerTitle')}
          </AppText>
          <Button
            label={t('common.cancel')}
            variant="outline"
            testID="supplier-picker-close-btn"
            onPress={onClose}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label={showCreateForm ? t('common.back') : t('suppliers.addNewButton')}
            variant={showCreateForm ? 'outline' : 'secondary'}
            onPress={() => {
              setFormError(null);
              setShowCreateForm((prev) => !prev);
            }}
            style={{ flexGrow: 1 }}
          />
          {selectedSupplierId ? (
            <Button
              label={t('purchases.walkInSupplier')}
              variant="outline"
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            />
          ) : null}
        </View>

        {showCreateForm ? (
          <Card style={{ gap: 10 }}>
            <AppText variant="body" weight="bold">
              {t('suppliers.createTitle')}
            </AppText>
            {formError ? (
              <AppText variant="caption" weight="semibold" color={Colors.danger}>
                {formError}
              </AppText>
            ) : null}
            <Input
              label={t('suppliers.nameBnLabel')}
              placeholder={t('suppliers.nameBnPlaceholder')}
              value={nameBn}
              onChangeText={setNameBn}
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
            <Button
              label={t('suppliers.createSubmit')}
              fullWidth
              loading={createSupplierMutation.isPending}
              onPress={() => void handleCreateSubmit()}
            />
          </Card>
        ) : (
          <>
            <Input
              placeholder={t('suppliers.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
            />
            <FilterChip
              label={t('suppliers.payableOnlyFilter')}
              selected={withPayablesOnly}
              tone="warning"
              onPress={() => setWithPayablesOnly((prev) => !prev)}
            />

            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {suppliersQuery.isLoading ? (
                <LoadingView />
              ) : suppliers.length === 0 ? (
                <Card style={{ padding: 16 }}>
                  <AppText variant="body" color={Colors.textSecondary}>
                    {t('suppliers.emptyTitle')}
                  </AppText>
                </Card>
              ) : (
                suppliers.map((supplier) => {
                  const isSelected = supplier.id === selectedSupplierId;
                  const displayName = getLocalizedSupplierName(supplier, language);
                  return (
                    <Pressable
                      key={supplier.id}
                      accessibilityRole="button"
                      testID={`supplier-option-${supplier.id}`}
                      onPress={() => {
                        onSelect(supplier);
                        onClose();
                      }}
                    >
                      <Card
                        style={{
                          padding: 12,
                          gap: 4,
                          borderColor: isSelected ? Colors.primary : Colors.border,
                          backgroundColor: isSelected ? Colors.primarySoft : Colors.surface,
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
                          <View style={{ flex: 1 }}>
                            <AppText variant="body" weight="bold">
                              {displayName}
                            </AppText>
                            {supplier.phone ? (
                              <AppText variant="caption" color={Colors.textSecondary}>
                                {supplier.phone}
                              </AppText>
                            ) : null}
                            {supplier.address ? (
                              <AppText variant="caption" color={Colors.textMuted}>
                                {supplier.address}
                              </AppText>
                            ) : null}
                          </View>
                          <Badge
                            label={
                              supplier.payablePoisha > 0
                                ? t('suppliers.payableBadge', {
                                    amount: formatMoney(supplier.payablePoisha),
                                  })
                                : t('suppliers.settledBadge')
                            }
                            tone={supplier.payablePoisha > 0 ? 'warning' : 'success'}
                          />
                        </View>
                      </Card>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

export function SupplierPickerModal({
  visible,
  selectedSupplierId,
  onSelect,
  onClose,
}: SupplierPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <SupplierPickerContent
          selectedSupplierId={selectedSupplierId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
