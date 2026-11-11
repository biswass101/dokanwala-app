import { isValidPinFormat, normalizePinInput } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Input, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { authApi } from '@/services/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function SetupPinScreen() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const updateLocalUserPin = useAuthStore((state) => state.updateLocalUserPin);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSavePin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword.trim()) {
      setErrorMsg(t('validation.requiredCurrentPassword'));
      return;
    }
    if (!isValidPinFormat(newPin)) {
      setErrorMsg(t('validation.invalidPin'));
      return;
    }

    const normalizedPin = normalizePinInput(newPin);
    setSubmitting(true);
    try {
      const { user } = await authApi.setPin({
        currentPassword,
        pin: normalizedPin,
      });
      await updateLocalUserPin(user, normalizedPin);
      setSuccessMsg(t('pin.pinSaved'));
      setCurrentPassword('');
      setNewPin('');
    } catch (err) {
      setErrorMsg(getLocalizedErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold">
          {t('pin.setupTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      <Card style={{ gap: 14 }}>
        <AppText variant="body" color={Colors.textSecondary}>
          {t('pin.setupSubtitle')}
        </AppText>

        {errorMsg ? (
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {errorMsg}
          </AppText>
        ) : null}

        {successMsg ? (
          <AppText variant="caption" weight="semibold" color={Colors.success}>
            {successMsg}
          </AppText>
        ) : null}

        <Input
          label={t('pin.currentPasswordLabel')}
          placeholder={t('auth.passwordPlaceholder')}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <Input
          label={t('pin.newPinLabel')}
          placeholder={t('auth.pinPlaceholder')}
          value={newPin}
          onChangeText={setNewPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />

        <Button
          label={t('pin.savePin')}
          fullWidth
          loading={submitting}
          onPress={() => void handleSavePin()}
        />
      </Card>
    </ScreenContainer>
  );
}
