import type { SupplierDto } from '@dokanwala/shared';
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
import { FilterChip } from '@/features/products/components/FilterChip';
import { OwnerOnlyScreen } from '@/features/purchases/components/OwnerOnlyScreen';
import { SupplierFormModal } from '@/features/purchases/components/SupplierFormModal';
import { useSuppliersQuery } from '@/features/purchases/hooks/usePurchasesQueries';
import { getLocalizedSupplierName } from '@/features/purchases/utils/purchase-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

function SuppliersDirectoryContent() {
  const { t, language } = useAppTranslation();
  const { formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [withPayablesOnly, setWithPayablesOnly] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);

  const suppliersQuery = useSuppliersQuery({
    ...(search.trim().length > 0 ? { q: search.trim() } : {}),
    withPayablesOnly,
  });

  const suppliers = useMemo(
    () => suppliersQuery.data?.suppliers ?? [],
    [suppliersQuery.data?.suppliers],
  );
  const fromOfflineCache = Boolean(suppliersQuery.data?.fromOfflineCache);

  const totalPayablePoisha = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.payablePoisha, 0),
    [suppliers],
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
          {t('suppliers.title')}
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

      {/* Payable Summary & Add Button */}
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
              {t('suppliers.totalPayableSummary')}
            </AppText>
            <AppText variant="screenTitle" weight="bold" color={Colors.primaryPressed}>
              {formatMoney(totalPayablePoisha)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {formatDigits(t('suppliers.supplierCount', { count: suppliers.length }))}
            </AppText>
          </View>
          <Button
            label={t('suppliers.addNewButton')}
            testID="suppliers-add-new-btn"
            onPress={() => setFormModalOpen(true)}
          />
        </View>
      </Card>

      <Input
        placeholder={t('suppliers.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <FilterChip
          label={t('suppliers.payableOnlyFilter')}
          selected={withPayablesOnly}
          tone="warning"
          onPress={() => setWithPayablesOnly((prev) => !prev)}
        />
      </View>

      {suppliersQuery.isLoading ? (
        <LoadingView />
      ) : suppliersQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(suppliersQuery.error, t)}
          onRetry={() => void suppliersQuery.refetch()}
        />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('suppliers.emptyTitle')}
          description={t('suppliers.emptyDesc')}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {suppliers.map((supplier: SupplierDto) => {
            const displayName = getLocalizedSupplierName(supplier, language);
            return (
              <Pressable
                key={supplier.id}
                accessibilityRole="button"
                testID={`supplier-card-${supplier.id}`}
                onPress={() => router.push(`/suppliers/${supplier.id}`)}
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
                      {supplier.phone ? (
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {formatDigits(supplier.phone)}
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
                      {t('suppliers.totalPurchasedLabel')}:{' '}
                      {formatMoney(supplier.totalPurchasedPoisha)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('suppliers.totalPaidLabel')}: {formatMoney(supplier.totalPaidPoisha)}
                    </AppText>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      <SupplierFormModal
        visible={formModalOpen}
        supplier={null}
        onClose={() => setFormModalOpen(false)}
      />
    </ScreenContainer>
  );
}

export default function SuppliersDirectoryScreen() {
  const { t } = useAppTranslation();
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'OWNER') {
    return (
      <OwnerOnlyScreen title={t('suppliers.title')} description={t('suppliers.ownerOnlyDesc')} />
    );
  }

  return <SuppliersDirectoryContent />;
}
