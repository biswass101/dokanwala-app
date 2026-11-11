import {
  isValidPinFormat,
  normalizeBdPhone,
  normalizePinInput,
  PASSWORD_MIN_LENGTH,
} from '@dokanwala/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, Pressable, View } from 'react-native';
import { z } from 'zod';
import { AppText, Button, Card, Input, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { authApi } from '@/services/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

interface LoginFormValues {
  phone: string;
  secret: string;
}

interface RegisterFormValues {
  shopNameBn: string;
  shopNameEn?: string | undefined;
  shopAddressBn?: string | undefined;
  ownerName: string;
  phone: string;
  password: string;
  pin: string;
}

export default function LoginScreen() {
  const { t, language, toggleLanguage } = useAppTranslation();
  const digitStyle = usePreferencesStore((state) => state.digitStyle);
  const completeOnlineAuth = useAuthStore((state) => state.completeOnlineAuth);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'pin'>('password');
  const [showSecret, setShowSecret] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const loginFormSchema = useMemo(
    () =>
      z.object({
        phone: z
          .string()
          .trim()
          .refine((val) => normalizeBdPhone(val) !== null, {
            message: t('validation.invalidPhone'),
          }),
        secret: z.string().trim().min(1, t('validation.requiredSecret')),
      }),
    [t],
  );

  const registerFormSchema = useMemo(
    () =>
      z.object({
        shopNameBn: z.string().trim().min(2, t('validation.minShopNameBn')),
        shopNameEn: z.string().trim().optional(),
        shopAddressBn: z.string().trim().optional(),
        ownerName: z.string().trim().min(2, t('validation.minOwnerName')),
        phone: z
          .string()
          .trim()
          .refine((val) => normalizeBdPhone(val) !== null, {
            message: t('validation.invalidPhone'),
          }),
        password: z.string().min(PASSWORD_MIN_LENGTH, t('validation.minPassword')),
        pin: z
          .string()
          .trim()
          .refine((val) => val.length === 0 || isValidPinFormat(val), {
            message: t('validation.invalidPin'),
          }),
      }),
    [t],
  );

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { phone: '', secret: '' },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      shopNameBn: '',
      shopNameEn: '',
      shopAddressBn: '',
      ownerName: '',
      phone: '',
      password: '',
      pin: '',
    },
  });

  const onLoginSubmit = async (values: LoginFormValues) => {
    setApiError(null);
    const normalizedPhone = normalizeBdPhone(values.phone);
    if (!normalizedPhone) return;

    try {
      if (loginMethod === 'pin') {
        if (!isValidPinFormat(values.secret)) {
          loginForm.setError('secret', { message: t('validation.invalidPin') });
          return;
        }
        const normalizedPin = normalizePinInput(values.secret);
        const session = await authApi.pinLogin({
          phone: normalizedPhone,
          pin: normalizedPin,
          deviceName: Platform.OS,
        });
        await completeOnlineAuth(session, normalizedPin);
        return;
      }

      const session = await authApi.login({
        phone: normalizedPhone,
        password: values.secret,
        deviceName: Platform.OS,
      });
      await completeOnlineAuth(session);
    } catch (err) {
      setApiError(getLocalizedErrorMessage(err, t));
    }
  };

  const onRegisterSubmit = async (values: RegisterFormValues) => {
    setApiError(null);
    const normalizedPhone = normalizeBdPhone(values.phone);
    if (!normalizedPhone) return;

    const normalizedPin =
      values.pin.trim().length > 0 ? normalizePinInput(values.pin) : undefined;

    try {
      const session = await authApi.register({
        shopNameBn: values.shopNameBn,
        ...(values.shopNameEn ? { shopNameEn: values.shopNameEn } : {}),
        ...(values.shopAddressBn ? { shopAddressBn: values.shopAddressBn } : {}),
        ownerName: values.ownerName,
        phone: normalizedPhone,
        password: values.password,
        ...(normalizedPin ? { pin: normalizedPin } : {}),
        preferredLanguage: language,
        preferredDigitStyle: digitStyle,
        deviceName: Platform.OS,
      });
      await completeOnlineAuth(session, normalizedPin);
    } catch (err) {
      setApiError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <ScreenContainer>
      {/* Header + Instant Bangla/English Switch */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="kpiHero" weight="bold" color={Colors.primary}>
            {t('app.name')}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('app.subtitle')}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch language"
          onPress={toggleLanguage}
          style={{
            minHeight: Layout.minTouchTarget,
            minWidth: Layout.minTouchTarget,
            paddingHorizontal: 14,
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

      {/* Mode Switcher: Login vs New Shop */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: Colors.border,
          borderRadius: 12,
          padding: 4,
          gap: 4,
        }}
      >
        {(['login', 'register'] as const).map((tab) => {
          const active = mode === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="button"
              onPress={() => {
                setMode(tab);
                setApiError(null);
              }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 10,
                backgroundColor: active ? Colors.surface : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText
                variant="body"
                weight="semibold"
                color={active ? Colors.primary : Colors.textSecondary}
              >
                {tab === 'login' ? t('auth.loginTab') : t('auth.registerTab')}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {apiError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA' }}>
          <AppText variant="body" weight="medium" color={Colors.danger}>
            {apiError}
          </AppText>
        </Card>
      ) : null}

      {mode === 'login' ? (
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('auth.loginTitle')}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('auth.loginSubtitle')}
            </AppText>
          </View>

          {/* Password vs Quick PIN Toggle */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t('auth.usePassword')}
              variant={loginMethod === 'password' ? 'secondary' : 'outline'}
              onPress={() => {
                setLoginMethod('password');
                loginForm.setValue('secret', '');
              }}
              style={{ flex: 1 }}
            />
            <Button
              label={t('auth.useQuickPin')}
              variant={loginMethod === 'pin' ? 'secondary' : 'outline'}
              onPress={() => {
                setLoginMethod('pin');
                loginForm.setValue('secret', '');
              }}
              style={{ flex: 1 }}
            />
          </View>

          <Controller
            control={loginForm.control}
            name="phone"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.phoneLabel')}
                placeholder={t('auth.phonePlaceholder')}
                value={value}
                onChangeText={onChange}
                keyboardType="phone-pad"
                autoCapitalize="none"
                error={error?.message}
              />
            )}
          />

          <Controller
            control={loginForm.control}
            name="secret"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <View style={{ gap: 6 }}>
                <Input
                  label={
                    loginMethod === 'pin'
                      ? t('pin.newPinLabel')
                      : t('auth.passwordLabel')
                  }
                  placeholder={
                    loginMethod === 'pin'
                      ? t('auth.pinPlaceholder')
                      : t('auth.passwordPlaceholder')
                  }
                  value={value}
                  onChangeText={onChange}
                  keyboardType={loginMethod === 'pin' ? 'number-pad' : 'default'}
                  secureTextEntry={!showSecret}
                  autoCapitalize="none"
                  error={error?.message}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowSecret((prev) => !prev)}
                  style={{ alignSelf: 'flex-end', paddingVertical: 4 }}
                >
                  <AppText variant="caption" weight="semibold" color={Colors.primary}>
                    {showSecret ? t('auth.hidePassword') : t('auth.showPassword')}
                  </AppText>
                </Pressable>
              </View>
            )}
          />

          <Button
            label={t('auth.loginButton')}
            fullWidth
            loading={loginForm.formState.isSubmitting}
            onPress={() => void loginForm.handleSubmit(onLoginSubmit)()}
          />
        </Card>
      ) : (
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('auth.registerTitle')}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('auth.registerSubtitle')}
            </AppText>
          </View>

          <Controller
            control={registerForm.control}
            name="shopNameBn"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.shopNameBnLabel')}
                placeholder={t('auth.shopNameBnPlaceholder')}
                value={value}
                onChangeText={onChange}
                error={error?.message}
              />
            )}
          />

          <Controller
            control={registerForm.control}
            name="shopNameEn"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.shopNameEnLabel')}
                placeholder={t('auth.shopNameEnPlaceholder')}
                value={value}
                onChangeText={onChange}
                error={error?.message}
              />
            )}
          />

          <Controller
            control={registerForm.control}
            name="shopAddressBn"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.shopAddressLabel')}
                placeholder={t('auth.shopAddressPlaceholder')}
                value={value}
                onChangeText={onChange}
                error={error?.message}
              />
            )}
          />

          <Controller
            control={registerForm.control}
            name="ownerName"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.ownerNameLabel')}
                placeholder={t('auth.ownerNamePlaceholder')}
                value={value}
                onChangeText={onChange}
                error={error?.message}
              />
            )}
          />

          <Controller
            control={registerForm.control}
            name="phone"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.phoneLabel')}
                placeholder={t('auth.phonePlaceholder')}
                value={value}
                onChangeText={onChange}
                keyboardType="phone-pad"
                error={error?.message}
              />
            )}
          />

          <Controller
            control={registerForm.control}
            name="password"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.passwordLabel')}
                placeholder={t('auth.passwordPlaceholder')}
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showSecret}
                autoCapitalize="none"
                error={error?.message}
              />
            )}
          />

          <Controller
            control={registerForm.control}
            name="pin"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Input
                label={t('auth.pinOptionalLabel')}
                placeholder={t('auth.pinPlaceholder')}
                value={value}
                onChangeText={onChange}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                error={error?.message}
              />
            )}
          />

          <Button
            label={t('auth.registerButton')}
            fullWidth
            loading={registerForm.formState.isSubmitting}
            onPress={() => void registerForm.handleSubmit(onRegisterSubmit)()}
          />
        </Card>
      )}
    </ScreenContainer>
  );
}
