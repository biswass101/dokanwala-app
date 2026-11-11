import { normalizeBdPhone } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { AppText, Button, Card, Input, NumericInput, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { shopApi } from '@/services/api/shop';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function ShopSettingsScreen() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const shop = useAuthStore((state) => state.shop);
  const updateLocalShop = useAuthStore((state) => state.updateLocalShop);

  const isOwner = user?.role === 'OWNER';

  const [nameBn, setNameBn] = useState(shop?.nameBn ?? '');
  const [nameEn, setNameEn] = useState(shop?.nameEn ?? '');
  const [addressBn, setAddressBn] = useState(shop?.addressBn ?? '');
  const [phone, setPhone] = useState(shop?.phone ?? '');
  const [receiptHeaderBn, setReceiptHeaderBn] = useState(shop?.receiptHeaderBn ?? '');
  const [receiptFooterBn, setReceiptFooterBn] = useState(shop?.receiptFooterBn ?? '');
  const [allowNegativeStock, setAllowNegativeStock] = useState(shop?.allowNegativeStock ?? false);
  const [employeeCanGiveCredit, setEmployeeCanGiveCredit] = useState(
    shop?.employeeCanGiveCredit ?? true,
  );
  const [maxDiscountStr, setMaxDiscountStr] = useState(
    String(shop?.employeeMaxDiscountPercent ?? 10),
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleSave = async () => {
    if (!isOwner) return;
    setErrorMsg(null);
    setSavedMsg(null);

    if (nameBn.trim().length < 2) {
      setErrorMsg(t('validation.minShopNameBn'));
      return;
    }

    const trimmedPhone = phone.trim();
    const normalizedPhone = trimmedPhone.length > 0 ? normalizeBdPhone(trimmedPhone) : null;
    if (trimmedPhone.length > 0 && !normalizedPhone) {
      setErrorMsg(t('validation.invalidPhone'));
      return;
    }

    const discountPct = Math.min(100, Math.max(0, Number.parseInt(maxDiscountStr || '0', 10) || 0));

    setSaving(true);
    try {
      const res = await shopApi.updateShop({
        nameBn: nameBn.trim(),
        nameEn: nameEn.trim() || null,
        addressBn: addressBn.trim() || null,
        phone: normalizedPhone,
        receiptHeaderBn: receiptHeaderBn.trim() || null,
        receiptFooterBn: receiptFooterBn.trim() || null,
        allowNegativeStock,
        employeeCanGiveCredit,
        employeeMaxDiscountPercent: discountPct,
      });
      await updateLocalShop(res.shop);
      setSavedMsg(t('common.savedSuccess'));
    } catch (err) {
      setErrorMsg(getLocalizedErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold">
          {t('shop.settingsTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {!isOwner ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A' }}>
          <AppText variant="body" weight="semibold" color={Colors.warning}>
            {t('shop.ownerOnlyNote')}
          </AppText>
        </Card>
      ) : null}

      {errorMsg ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA' }}>
          <AppText variant="body" color={Colors.danger}>
            {errorMsg}
          </AppText>
        </Card>
      ) : null}

      {savedMsg ? (
        <Card style={{ backgroundColor: Colors.successSoft, borderColor: '#BBF7D0' }}>
          <AppText variant="body" weight="semibold" color={Colors.success}>
            {savedMsg}
          </AppText>
        </Card>
      ) : null}

      <Card style={{ gap: 14 }}>
        <Input
          label={t('shop.nameBnLabel')}
          value={nameBn}
          onChangeText={setNameBn}
          editable={isOwner}
        />
        <Input
          label={t('shop.nameEnLabel')}
          value={nameEn}
          onChangeText={setNameEn}
          editable={isOwner}
        />
        <Input
          label={t('shop.addressBnLabel')}
          value={addressBn}
          onChangeText={setAddressBn}
          editable={isOwner}
        />
        <Input
          label={t('shop.phoneLabel')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={isOwner}
        />
        <Input
          label={t('shop.receiptHeaderLabel')}
          value={receiptHeaderBn}
          onChangeText={setReceiptHeaderBn}
          editable={isOwner}
        />
        <Input
          label={t('shop.receiptFooterLabel')}
          placeholder={t('shop.receiptFooterPlaceholder')}
          value={receiptFooterBn}
          onChangeText={setReceiptFooterBn}
          editable={isOwner}
        />
      </Card>

      <Card style={{ gap: 14 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AppText variant="body" style={{ flex: 1 }}>
            {t('shop.allowNegativeStock')}
          </AppText>
          <Switch
            value={allowNegativeStock}
            onValueChange={setAllowNegativeStock}
            disabled={!isOwner}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AppText variant="body" style={{ flex: 1 }}>
            {t('shop.employeeCanGiveCredit')}
          </AppText>
          <Switch
            value={employeeCanGiveCredit}
            onValueChange={setEmployeeCanGiveCredit}
            disabled={!isOwner}
          />
        </View>

        <NumericInput
          label={t('shop.employeeDiscountLabel')}
          value={maxDiscountStr}
          editable={isOwner}
          onChangeNormalized={(normalized) => setMaxDiscountStr(normalized)}
        />
      </Card>

      {isOwner ? (
        <Button
          label={t('common.save')}
          fullWidth
          loading={saving}
          onPress={() => void handleSave()}
        />
      ) : null}
    </ScreenContainer>
  );
}
