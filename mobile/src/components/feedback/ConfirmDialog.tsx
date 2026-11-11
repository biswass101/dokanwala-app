import React from 'react';
import { Modal, View } from 'react-native';
import { Colors, Layout } from '@/theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: Colors.surface,
            borderRadius: Layout.cardRadius,
            padding: 20,
            gap: 14,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <AppText variant="sectionTitle" weight="bold">
            {title}
          </AppText>
          <AppText variant="body" color={Colors.textSecondary}>
            {message}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button
              label={cancelLabel}
              variant="outline"
              disabled={loading}
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              onPress={onConfirm}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
