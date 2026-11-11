import {
  isValidPinFormat,
  normalizeBdPhone,
  normalizePinInput,
  PASSWORD_MIN_LENGTH,
  type StaffMemberDto,
} from '@dokanwala/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
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
} from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { shopApi } from '@/services/api/shop';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function StaffManagementScreen() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isOwner = currentUser?.role === 'OWNER';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['shop-users'],
    queryFn: () => shopApi.listUsers(),
    enabled: isOwner,
  });

  const createMutation = useMutation({
    mutationFn: shopApi.createEmployee,
    onSuccess: () => {
      setName('');
      setPhone('');
      setPassword('');
      setPin('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['shop-users'] });
    },
    onError: (err) => {
      setFormError(getLocalizedErrorMessage(err, t));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      shopApi.updateUser(id, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shop-users'] });
    },
  });

  const handleCreateEmployee = () => {
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError(t('validation.minStaffName'));
      return;
    }
    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone) {
      setFormError(t('validation.invalidPhone'));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFormError(t('validation.minPassword'));
      return;
    }
    const normalizedPin = pin.trim().length > 0 ? normalizePinInput(pin) : undefined;
    if (pin.trim().length > 0 && !isValidPinFormat(pin)) {
      setFormError(t('validation.invalidPin'));
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      phone: normalizedPhone,
      password,
      ...(normalizedPin ? { pin: normalizedPin } : {}),
    });
  };

  if (!isOwner) {
    return (
      <ScreenContainer>
        <ErrorState
          title={t('common.errorTitle')}
          message={t('shop.ownerOnlyNote')}
          onRetry={() => router.back()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold">
          {t('staff.title')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {/* Add Employee Card */}
      <Card style={{ gap: 12 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('staff.addEmployee')}
        </AppText>

        {formError ? (
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {formError}
          </AppText>
        ) : null}

        <Input
          label={t('staff.nameLabel')}
          placeholder={t('staff.namePlaceholder')}
          value={name}
          onChangeText={setName}
        />
        <Input
          label={t('staff.phoneLabel')}
          placeholder={t('auth.phonePlaceholder')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Input
          label={t('staff.passwordLabel')}
          placeholder={t('auth.passwordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Input
          label={t('staff.pinLabel')}
          placeholder={t('auth.pinPlaceholder')}
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />

        <Button
          label={t('staff.createButton')}
          fullWidth
          loading={createMutation.isPending}
          onPress={handleCreateEmployee}
        />
      </Card>

      {/* Staff List */}
      {usersQuery.isLoading ? (
        <LoadingView />
      ) : usersQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(usersQuery.error, t)}
          onRetry={() => void usersQuery.refetch()}
        />
      ) : !usersQuery.data || usersQuery.data.users.length === 0 ? (
        <EmptyState title={t('staff.empty')} />
      ) : (
        <View style={{ gap: 10 }}>
          {usersQuery.data.users.map((member: StaffMemberDto) => (
            <Card key={member.id} style={{ gap: 10 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="sectionTitle" weight="semibold">
                    {member.name}
                  </AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {member.phone} • {t(`roles.${member.role}`)}
                  </AppText>
                </View>

                <Badge
                  label={member.isActive ? t('staff.activeBadge') : t('staff.inactiveBadge')}
                  tone={member.isActive ? 'success' : 'danger'}
                />
              </View>

              {member.id !== currentUser?.id ? (
                <Button
                  label={member.isActive ? t('staff.deactivate') : t('staff.activate')}
                  variant={member.isActive ? 'outline' : 'secondary'}
                  loading={toggleActiveMutation.isPending}
                  onPress={() =>
                    toggleActiveMutation.mutate({
                      id: member.id,
                      isActive: !member.isActive,
                    })
                  }
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
