import { bdtToPoisha } from '@dokanwala/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  NumericInput,
  ScreenContainer,
  SyncStatusPill,
} from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { fetchHealthStatus } from '@/services/api/health';
import { useAuthStore } from '@/store/auth.store';
import { Colors, Layout } from '@/theme/tokens';

export default function HomeScreen() {
  const { t, toggleLanguage } = useAppTranslation();
  const { formatMoney } = useFormattedMoney();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const shop = useAuthStore((state) => state.shop);

  const [sampleAmountRaw, setSampleAmountRaw] = useState('১২৫০.৫০');
  const [sampleAmountAscii, setSampleAmountAscii] = useState('1250.50');

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealthStatus,
  });

  const formattedSample = useMemo(() => {
    if (!sampleAmountAscii) {
      return formatMoney(0);
    }
    try {
      const poisha = bdtToPoisha(sampleAmountAscii);
      return formatMoney(poisha);
    } catch {
      return formatMoney(0);
    }
  }, [sampleAmountAscii, formatMoney]);

  return (
    <ScreenContainer>
      {/* Top Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="screenTitle" weight="bold">
            {shop?.nameBn ?? t('app.name')}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {user
              ? `${t('home.greeting', { name: user.name })} • ${t(`roles.${user.role}`)}`
              : t('app.subtitle')}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            onPress={toggleLanguage}
            style={{
              minHeight: 40,
              minWidth: Layout.minTouchTarget,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="caption" weight="bold" color={Colors.primary}>
              {t('app.languageToggle')}
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Foundation Welcome Card */}
      <Card style={{ gap: 8, backgroundColor: Colors.primarySoft, borderColor: '#99F6E4' }}>
        <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
          {t('home.welcomeTitle')}
        </AppText>
        <AppText variant="body" color={Colors.textPrimary}>
          {t('home.welcomeDesc')}
        </AppText>
      </Card>

      {/* Live Backend & Database Health Card */}
      <Card style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AppText variant="sectionTitle" weight="semibold">
            {t('home.backendStatusTitle')}
          </AppText>
          {healthQuery.isSuccess ? (
            <Badge label={t('home.statusOnline')} tone="success" />
          ) : healthQuery.isError ? (
            <Badge label={t('home.statusOffline')} tone="danger" />
          ) : (
            <Badge label={t('common.loading')} tone="neutral" />
          )}
        </View>

        {healthQuery.data ? (
          <View style={{ gap: 4 }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {healthQuery.data.database === 'connected'
                ? t('home.databaseConnected')
                : t('home.databaseDisconnected')}
            </AppText>
            <AppText variant="caption" color={Colors.textMuted}>
              {healthQuery.data.service} • v{healthQuery.data.version} • {healthQuery.data.timezone}
            </AppText>
          </View>
        ) : null}

        <Button
          label={t('home.checkConnection')}
          variant="outline"
          loading={healthQuery.isFetching}
          onPress={() => void healthQuery.refetch()}
        />
      </Card>

      {/* Bangla Numeric & Currency Formatting Foundation Check */}
      <Card style={{ gap: 10 }}>
        <NumericInput
          label={t('home.banglaInputLabel')}
          placeholder={t('home.banglaInputPlaceholder')}
          value={sampleAmountRaw}
          onChangeNormalized={(normalized, raw) => {
            setSampleAmountRaw(raw);
            setSampleAmountAscii(normalized);
          }}
        />
        <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
          {t('home.normalizedPreview', { value: formattedSample })}
        </AppText>
      </Card>

      {/* Quick Action Navigation Skeleton */}
      <Card style={{ gap: 12 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('home.quickActionsTitle')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button
            label={t('home.actions.newSale')}
            onPress={() => router.push('/(tabs)/sales')}
            style={{ flexGrow: 1 }}
          />
          <Button
            label={t('home.actions.addProduct')}
            variant="secondary"
            onPress={() => router.push('/(tabs)/products')}
            style={{ flexGrow: 1 }}
          />
          <Button
            label={t('home.actions.purchase')}
            variant="outline"
            onPress={() => router.push('/(tabs)/more')}
            style={{ flexGrow: 1 }}
          />
          <Button
            label={t('home.actions.expense')}
            variant="outline"
            onPress={() => router.push('/(tabs)/more')}
            style={{ flexGrow: 1 }}
          />
          <Button
            label={t('home.actions.collectDue')}
            variant="outline"
            onPress={() => router.push('/(tabs)/more')}
            style={{ flexGrow: 1 }}
          />
        </View>
      </Card>
    </ScreenContainer>
  );
}
