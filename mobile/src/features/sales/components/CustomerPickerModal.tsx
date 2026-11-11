import { normalizeUnicodeText, type CustomerDto } from '@dokanwala/shared';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText, Badge, Button, Card, Input, LoadingView } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useCreateCustomerMutation,
  useCustomersQuery,
} from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export interface CustomerPickerModalProps {
  visible: boolean;
  selectedCustomerId?: string | null;
  onSelect: (customer: CustomerDto | null) => void;
  onClose: () => void;
}

function CustomerPickerContent({
  selectedCustomerId,
  onSelect,
  onClose,
}: Omit<CustomerPickerModalProps, 'visible'>) {
  const { t, language } = useAppTranslation();
  const { formatMoney } = useFormattedMoney();

  const [search, setSearch] = useState('');
  const [withDuesOnly, setWithDuesOnly] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [nameBn, setNameBn] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const customersQuery = useCustomersQuery({
    ...(search.trim().length > 0 ? { q: search.trim() } : {}),
    withDuesOnly,
  });
  const createCustomerMutation = useCreateCustomerMutation();

  const customers = customersQuery.data?.customers ?? [];

  const handleCreateSubmit = async () => {
    setFormError(null);
    const cleanName = normalizeUnicodeText(nameBn);
    if (!cleanName) {
      setFormError(t('validation.customerNameRequired'));
      return;
    }

    try {
      const res = await createCustomerMutation.mutateAsync({
        nameBn: cleanName,
        ...(phone.trim().length > 0 ? { phone: phone.trim() } : {}),
        ...(address.trim().length > 0 ? { address: normalizeUnicodeText(address) } : {}),
      });
      onSelect(res.customer);
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
            {t('customers.pickerTitle')}
          </AppText>
          <Button label={t('common.cancel')} variant="outline" onPress={onClose} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label={showCreateForm ? t('common.back') : t('customers.addNewButton')}
            variant={showCreateForm ? 'outline' : 'secondary'}
            onPress={() => {
              setFormError(null);
              setShowCreateForm((prev) => !prev);
            }}
            style={{ flexGrow: 1 }}
          />
          {selectedCustomerId ? (
            <Button
              label={t('pos.walkInCustomer')}
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
              {t('customers.createTitle')}
            </AppText>
            {formError ? (
              <AppText variant="caption" weight="semibold" color={Colors.danger}>
                {formError}
              </AppText>
            ) : null}
            <Input
              label={t('customers.nameBnLabel')}
              placeholder={t('customers.nameBnPlaceholder')}
              value={nameBn}
              onChangeText={setNameBn}
            />
            <Input
              label={t('customers.phoneLabel')}
              placeholder={t('customers.phonePlaceholder')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input
              label={t('customers.addressLabel')}
              placeholder={t('customers.addressPlaceholder')}
              value={address}
              onChangeText={setAddress}
            />
            <Button
              label={t('customers.createSubmit')}
              fullWidth
              loading={createCustomerMutation.isPending}
              onPress={() => void handleCreateSubmit()}
            />
          </Card>
        ) : (
          <>
            <Input
              placeholder={t('customers.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
            />
            <FilterChip
              label={t('customers.dueOnlyFilter')}
              selected={withDuesOnly}
              tone="warning"
              onPress={() => setWithDuesOnly((prev) => !prev)}
            />

            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {customersQuery.isLoading ? (
                <LoadingView />
              ) : customers.length === 0 ? (
                <Card style={{ padding: 16 }}>
                  <AppText variant="body" color={Colors.textSecondary}>
                    {t('customers.empty')}
                  </AppText>
                </Card>
              ) : (
                customers.map((customer) => {
                  const isSelected = customer.id === selectedCustomerId;
                  const displayName =
                    language === 'en' && customer.nameEn ? customer.nameEn : customer.nameBn;
                  return (
                    <Pressable
                      key={customer.id}
                      accessibilityRole="button"
                      testID={`customer-option-${customer.id}`}
                      onPress={() => {
                        onSelect(customer);
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
                            {customer.phone ? (
                              <AppText variant="caption" color={Colors.textSecondary}>
                                {customer.phone}
                              </AppText>
                            ) : null}
                          </View>
                          <Badge
                            label={
                              customer.duePoisha > 0
                                ? t('customers.dueLabel', {
                                    amount: formatMoney(customer.duePoisha),
                                  })
                                : t('customers.noDue')
                            }
                            tone={customer.duePoisha > 0 ? 'warning' : 'success'}
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

export function CustomerPickerModal({
  visible,
  selectedCustomerId,
  onSelect,
  onClose,
}: CustomerPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <CustomerPickerContent
          selectedCustomerId={selectedCustomerId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
