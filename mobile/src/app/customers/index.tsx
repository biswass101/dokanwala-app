import type { CustomerDto } from '@dokanwala/shared';
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
import { CustomerFormModal } from '@/features/customers/components/CustomerFormModal';
import { getLocalizedCustomerName } from '@/features/customers/utils/customer-format';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useCustomersQuery } from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function CustomersDirectoryScreen() {
  const { t, language } = useAppTranslation();
  const { formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [withDuesOnly, setWithDuesOnly] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);

  const customersQuery = useCustomersQuery({
    ...(search.trim().length > 0 ? { q: search.trim() } : {}),
    withDuesOnly,
  });

  const customers = useMemo(
    () => customersQuery.data?.customers ?? [],
    [customersQuery.data?.customers],
  );
  const fromOfflineCache = Boolean(customersQuery.data?.fromOfflineCache);

  const totalDuePoisha = useMemo(
    () => customers.reduce((sum, c) => sum + c.duePoisha, 0),
    [customers],
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
          {t('customers.title')}
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

      {/* Receivable Summary & Add Button */}
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
              {t('customers.totalDueSummary')}
            </AppText>
            <AppText variant="screenTitle" weight="bold" color={Colors.primaryPressed}>
              {formatMoney(totalDuePoisha)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {formatDigits(t('customers.customerCount', { count: customers.length }))}
            </AppText>
          </View>
          <Button
            label={t('customers.addNewButton')}
            testID="customers-add-new-btn"
            onPress={() => setFormModalOpen(true)}
          />
        </View>
      </Card>

      <Input
        placeholder={t('customers.searchPlaceholder')}
        accessibilityLabel={t('customers.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <FilterChip
          label={t('customers.dueOnlyFilter')}
          selected={withDuesOnly}
          tone="warning"
          onPress={() => setWithDuesOnly((prev) => !prev)}
        />
      </View>

      {customersQuery.isLoading ? (
        <LoadingView />
      ) : customersQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(customersQuery.error, t)}
          onRetry={() => void customersQuery.refetch()}
        />
      ) : customers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('customers.emptyTitle')}
          description={t('customers.emptyDesc')}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {customers.map((customer: CustomerDto) => {
            const displayName = getLocalizedCustomerName(customer, language);
            return (
              <Pressable
                key={customer.id}
                accessibilityRole="button"
                testID={`customer-card-${customer.id}`}
                onPress={() => router.push(`/customers/${customer.id}`)}
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
                        {displayName}
                      </AppText>
                      {customer.phone ? (
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {formatDigits(customer.phone)}
                        </AppText>
                      ) : null}
                      {customer.address ? (
                        <AppText variant="caption" color={Colors.textMuted}>
                          {customer.address}
                        </AppText>
                      ) : null}
                    </View>
                    <Badge
                      label={
                        customer.duePoisha > 0
                          ? t('customers.dueBadge', {
                              amount: formatMoney(customer.duePoisha),
                            })
                          : t('customers.settledBadge')
                      }
                      tone={customer.duePoisha > 0 ? 'warning' : 'success'}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      borderTopWidth: 1,
                      borderTopColor: Colors.border,
                      paddingTop: 6,
                    }}
                  >
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('customers.totalPurchasedLabel')}:{' '}
                      {formatMoney(customer.totalPurchasedPoisha)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('customers.totalPaidLabel')}: {formatMoney(customer.totalPaidPoisha)}
                    </AppText>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      <CustomerFormModal
        visible={formModalOpen}
        customer={null}
        onClose={() => setFormModalOpen(false)}
      />
    </ScreenContainer>
  );
}
