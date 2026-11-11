import { PIN_MIN_LENGTH } from '@dokanwala/shared';
import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  PinKeypad,
  ScreenContainer,
} from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';

export default function PinUnlockScreen() {
  const { t } = useAppTranslation();
  const { formatDigits } = useFormattedMoney();
  const user = useAuthStore((state) => state.user);
  const shop = useAuthStore((state) => state.shop);
  const unlockWithPinOffline = useAuthStore((state) => state.unlockWithPinOffline);
  const clearLocalAuthOnly = useAuthStore((state) => state.clearLocalAuthOnly);

  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const handleUnlock = async (candidatePin: string) => {
    if (candidatePin.length < PIN_MIN_LENGTH || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const result = await unlockWithPinOffline(candidatePin);
      if (result.ok) {
        setPin('');
        return;
      }
      setPin('');
      if (result.reason === 'LOCKED') {
        setLocked(true);
        setErrorMsg(t('pin.locked'));
      } else if (result.reason === 'WIPED') {
        setErrorMsg(t('pin.wiped'));
      } else if (result.reason === 'INVALID_PIN') {
        setErrorMsg(
          t('pin.wrongPin', {
            remaining: formatDigits(result.remainingAttempts ?? 1),
          }),
        );
      } else {
        await clearLocalAuthOnly();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 12 }}>
        <Badge label={t('sync.offlineMode')} tone="primary" />
        <AppText variant="screenTitle" weight="bold" style={{ textAlign: 'center' }}>
          {shop?.nameBn ?? t('app.name')}
        </AppText>
        {user ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {user.name} • {t(`roles.${user.role}`)}
          </AppText>
        ) : null}
      </View>

      <Card style={{ gap: 16, alignItems: 'center', paddingVertical: 20 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <AppText variant="sectionTitle" weight="bold">
            {t('pin.unlockTitle')}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary} style={{ textAlign: 'center' }}>
            {t('pin.unlockSubtitle')}
          </AppText>
        </View>

        {errorMsg ? (
          <View
            style={{
              backgroundColor: Colors.dangerSoft,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              width: '100%',
            }}
          >
            <AppText variant="caption" weight="semibold" color={Colors.danger} style={{ textAlign: 'center' }}>
              {errorMsg}
            </AppText>
          </View>
        ) : null}

        <PinKeypad
          value={pin}
          disabled={submitting || locked}
          onChange={(next) => {
            setErrorMsg(null);
            setPin(next);
          }}
        />

        <Button
          label={t('pin.unlockButton')}
          fullWidth
          disabled={pin.length < PIN_MIN_LENGTH || locked}
          loading={submitting}
          onPress={() => void handleUnlock(pin)}
        />
      </Card>

      <Button
        label={t('pin.switchToPassword')}
        variant="outline"
        fullWidth
        onPress={() => void clearLocalAuthOnly()}
      />
    </ScreenContainer>
  );
}
