import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { AppText, Badge, Button, Card, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { Colors } from '@/theme/tokens';

export default function MoreScreen() {
  const { t, language, setLanguage } = useAppTranslation();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const shop = useAuthStore((state) => state.shop);
  const hasOfflinePin = useAuthStore((state) => state.hasOfflinePin);
  const lockApp = useAuthStore((state) => state.lockApp);
  const logout = useAuthStore((state) => state.logout);

  const digitStyle = usePreferencesStore((state) => state.digitStyle);
  const setDigitStyle = usePreferencesStore((state) => state.setDigitStyle);

  const [loggingOut, setLoggingOut] = useState(false);
  const isOwner = user?.role === 'OWNER';

  const executeLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogoutPress = () => {
    if (Platform.OS === 'web') {
      void executeLogout();
      return;
    }
    Alert.alert(t('auth.logout'), t('auth.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.logout'),
        style: 'destructive',
        onPress: () => void executeLogout(),
      },
    ]);
  };

  return (
    <ScreenContainer>
      <AppText variant="screenTitle" weight="bold">
        {t('tabs.more')}
      </AppText>

      {/* Active Shop & User Card */}
      <Card style={{ gap: 8 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="sectionTitle" weight="bold">
              {shop?.nameBn ?? t('app.name')}
            </AppText>
            <AppText variant="body" color={Colors.textSecondary}>
              {user?.name} • {user?.phone}
            </AppText>
          </View>
          {user ? <Badge label={t(`roles.${user.role}`)} tone="primary" /> : null}
        </View>
      </Card>

      {/* Shop & Security Management */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('more.profileSection')}
        </AppText>

        {isOwner ? (
          <>
            <Button
              label={t('more.shopSettings')}
              variant="outline"
              fullWidth
              onPress={() => router.push('/shop-settings')}
            />
            <Button
              label={t('more.staffManagement')}
              variant="outline"
              fullWidth
              onPress={() => router.push('/staff')}
            />
            <Button
              label={t('more.categoriesUnits')}
              variant="outline"
              fullWidth
              onPress={() => router.push('/categories-units')}
            />
            <Button
              label={t('more.newPurchase')}
              variant="outline"
              fullWidth
              onPress={() => router.push('/purchases/form')}
            />
            <Button
              label={t('more.purchases')}
              variant="outline"
              fullWidth
              onPress={() => router.push('/purchases')}
            />
            <Button
              label={t('more.suppliers')}
              variant="outline"
              fullWidth
              onPress={() => router.push('/suppliers')}
            />
          </>
        ) : null}

        <Button
          label={t('more.salesHistory')}
          variant="outline"
          fullWidth
          onPress={() => router.push('/sales/history')}
        />

        <Button
          label={t('more.quickPin')}
          variant="secondary"
          fullWidth
          onPress={() => router.push('/(auth)/setup-pin')}
        />

        {hasOfflinePin ? (
          <Button label={t('more.lockNow')} variant="outline" fullWidth onPress={lockApp} />
        ) : null}
      </Card>

      {/* Language & Bangla Numeral Preferences */}
      <Card style={{ gap: 12 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('more.preferencesSection')}
        </AppText>

        <View style={{ gap: 6 }}>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('more.languageLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="বাংলা"
              variant={language === 'bn' ? 'primary' : 'outline'}
              onPress={() => setLanguage('bn')}
              style={{ flex: 1 }}
            />
            <Button
              label="English"
              variant={language === 'en' ? 'primary' : 'outline'}
              onPress={() => setLanguage('en')}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('more.digitLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t('more.banglaDigits')}
              variant={digitStyle === 'bn' ? 'secondary' : 'outline'}
              onPress={() => setDigitStyle('bn')}
              style={{ flex: 1 }}
            />
            <Button
              label={t('more.englishDigits')}
              variant={digitStyle === 'en' ? 'secondary' : 'outline'}
              onPress={() => setDigitStyle('en')}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Card>

      <Button
        label={t('auth.logout')}
        variant="danger"
        fullWidth
        loading={loggingOut}
        onPress={handleLogoutPress}
      />
    </ScreenContainer>
  );
}
