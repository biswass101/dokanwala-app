import type { CategoryDto } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingView,
  ScreenContainer,
} from '@/components';
import {
  useArchiveCategoryMutation,
  useCategoriesQuery,
  useCreateCategoryMutation,
  useCreateUnitMutation,
  useUnitsQuery,
} from '@/features/products/hooks/useCatalogQueries';
import {
  getLocalizedCategoryName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function CategoriesAndUnitsScreen() {
  const { t, language } = useAppTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const categoriesQuery = useCategoriesQuery(false);
  const unitsQuery = useUnitsQuery();
  const createCategoryMut = useCreateCategoryMutation();
  const archiveCategoryMut = useArchiveCategoryMutation();
  const createUnitMut = useCreateUnitMutation();

  const [catNameBn, setCatNameBn] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CategoryDto | null>(null);

  const [unitCode, setUnitCode] = useState('');
  const [unitNameBn, setUnitNameBn] = useState('');
  const [unitNameEn, setUnitNameEn] = useState('');
  const [unitFractional, setUnitFractional] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

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

  const handleAddCategory = () => {
    setCatError(null);
    if (catNameBn.trim().length < 1) {
      setCatError(t('validation.minCategoryNameBn'));
      return;
    }
    createCategoryMut.mutate(
      {
        nameBn: catNameBn.trim(),
        ...(catNameEn.trim().length > 0 ? { nameEn: catNameEn.trim() } : {}),
      },
      {
        onSuccess: () => {
          setCatNameBn('');
          setCatNameEn('');
        },
        onError: (err) => setCatError(getLocalizedErrorMessage(err, t)),
      },
    );
  };

  const handleAddUnit = () => {
    setUnitError(null);
    const cleanedCode = unitCode.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,30}$/.test(cleanedCode)) {
      setUnitError(t('validation.invalidUnitCode'));
      return;
    }
    if (unitNameBn.trim().length < 1 || unitNameEn.trim().length < 1) {
      setUnitError(t('validation.minUnitName'));
      return;
    }
    createUnitMut.mutate(
      {
        code: cleanedCode,
        nameBn: unitNameBn.trim(),
        nameEn: unitNameEn.trim(),
        isFractional: unitFractional,
      },
      {
        onSuccess: () => {
          setUnitCode('');
          setUnitNameBn('');
          setUnitNameEn('');
          setUnitFractional(false);
        },
        onError: (err) => setUnitError(getLocalizedErrorMessage(err, t)),
      },
    );
  };

  const categories = categoriesQuery.data?.categories ?? [];
  const units = unitsQuery.data?.units ?? [];

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('categories.title')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {/* Create Category */}
      <Card style={{ gap: 12 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('categories.sectionTitle')}
        </AppText>
        {catError ? (
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {catError}
          </AppText>
        ) : null}
        <Input
          label={t('categories.nameBnLabel')}
          placeholder={t('categories.nameBnPlaceholder')}
          value={catNameBn}
          onChangeText={setCatNameBn}
        />
        <Input
          label={t('categories.nameEnLabel')}
          placeholder={t('categories.nameEnPlaceholder')}
          value={catNameEn}
          onChangeText={setCatNameEn}
        />
        <Button
          label={t('categories.addButton')}
          loading={createCategoryMut.isPending}
          fullWidth
          onPress={handleAddCategory}
        />
      </Card>

      {/* Category List */}
      {categoriesQuery.isLoading ? (
        <LoadingView />
      ) : categoriesQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(categoriesQuery.error, t)}
          onRetry={() => void categoriesQuery.refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState title={t('categories.empty')} />
      ) : (
        <View style={{ gap: 8 }}>
          {categories.map((cat) => (
            <Card key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="semibold">
                  {getLocalizedCategoryName(cat, language) ?? cat.nameBn}
                </AppText>
                {cat.nameEn ? (
                  <AppText variant="caption" color={Colors.textMuted}>
                    {language === 'bn' ? cat.nameEn : cat.nameBn}
                  </AppText>
                ) : null}
              </View>
              <Button
                label={t('categories.archiveButton')}
                variant="outline"
                onPress={() => setArchiveTarget(cat)}
              />
            </Card>
          ))}
        </View>
      )}

      {/* Create Custom Unit */}
      <Card style={{ gap: 12 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('units.sectionTitle')}
        </AppText>
        {unitError ? (
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {unitError}
          </AppText>
        ) : null}
        <Input
          label={t('units.codeLabel')}
          placeholder={t('units.codePlaceholder')}
          value={unitCode}
          onChangeText={setUnitCode}
          autoCapitalize="characters"
        />
        <Input
          label={t('units.nameBnLabel')}
          placeholder={t('units.nameBnPlaceholder')}
          value={unitNameBn}
          onChangeText={setUnitNameBn}
        />
        <Input
          label={t('units.nameEnLabel')}
          placeholder={t('units.nameEnPlaceholder')}
          value={unitNameEn}
          onChangeText={setUnitNameEn}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <AppText variant="body" style={{ flex: 1 }}>
            {t('units.fractionalLabel')}
          </AppText>
          <Switch value={unitFractional} onValueChange={setUnitFractional} />
        </View>
        <Button
          label={t('units.addButton')}
          variant="secondary"
          loading={createUnitMut.isPending}
          fullWidth
          onPress={handleAddUnit}
        />
      </Card>

      {/* Unit List */}
      {unitsQuery.isLoading ? (
        <LoadingView />
      ) : unitsQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(unitsQuery.error, t)}
          onRetry={() => void unitsQuery.refetch()}
        />
      ) : units.length === 0 ? (
        <EmptyState title={t('units.empty')} />
      ) : (
        <View style={{ gap: 8 }}>
          {units.map((unit) => (
            <Card key={unit.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="semibold">
                  {getLocalizedUnitName(unit, language)} ({unit.code})
                </AppText>
                <AppText variant="caption" color={Colors.textMuted}>
                  {unit.nameBn} • {unit.nameEn}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {unit.isFractional ? <Badge label={t('units.fractionalBadge')} tone="neutral" /> : null}
                <Badge
                  label={unit.isDefault ? t('units.defaultBadge') : t('units.customBadge')}
                  tone={unit.isDefault ? 'primary' : 'success'}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={Boolean(archiveTarget)}
        title={t('categories.archiveConfirmTitle')}
        message={t('categories.archiveConfirmMessage')}
        confirmLabel={t('categories.archiveButton')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={archiveCategoryMut.isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (!archiveTarget) return;
          archiveCategoryMut.mutate(archiveTarget.id, {
            onSettled: () => setArchiveTarget(null),
          });
        }}
      />
    </ScreenContainer>
  );
}
