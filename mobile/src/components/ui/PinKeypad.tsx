import { Ionicons } from '@expo/vector-icons';
import { PIN_MAX_LENGTH } from '@dokanwala/shared';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';
import { AppText } from './AppText';

export interface PinKeypadProps {
  value: string;
  maxLength?: number;
  disabled?: boolean;
  onChange: (nextAsciiPin: string) => void;
  onSubmit?: (pin: string) => void;
}

const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['CLEAR', '0', 'BACK'],
] as const;

export function PinKeypad({
  value,
  maxLength = PIN_MAX_LENGTH,
  disabled = false,
  onChange,
  onSubmit,
}: PinKeypadProps) {
  const { formatDigits } = useFormattedMoney();

  const handleDigitPress = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    const next = `${value}${digit}`;
    onChange(next);
    if (next.length === maxLength && onSubmit) {
      onSubmit(next);
    }
  };

  const handleBackspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled || value.length === 0) return;
    onChange('');
  };

  return (
    <View style={{ gap: 20, alignItems: 'center' }}>
      {/* PIN Dot Indicator */}
      <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 8 }}>
        {Array.from({ length: maxLength }).map((_, idx) => {
          const filled = idx < value.length;
          return (
            <View
              key={idx}
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: filled ? Colors.primary : Colors.border,
                backgroundColor: filled ? Colors.primary : Colors.surface,
              }}
            />
          );
        })}
      </View>

      {/* Digit Grid */}
      <View style={{ gap: 12, width: '100%', maxWidth: 300 }}>
        {KEY_ROWS.map((row, rowIdx) => (
          <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            {row.map((key) => {
              if (key === 'CLEAR') {
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel="Clear PIN"
                    disabled={disabled}
                    onPress={handleClear}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 60,
                      borderRadius: 14,
                      backgroundColor: pressed ? Colors.border : Colors.background,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Ionicons name="refresh-outline" size={22} color={Colors.textSecondary} />
                  </Pressable>
                );
              }

              if (key === 'BACK') {
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel="Backspace"
                    disabled={disabled}
                    onPress={handleBackspace}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 60,
                      borderRadius: 14,
                      backgroundColor: pressed ? Colors.border : Colors.background,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Ionicons name="backspace-outline" size={24} color={Colors.textPrimary} />
                  </Pressable>
                );
              }

              const displayDigit = formatDigits(key);
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`Digit ${key}`}
                  disabled={disabled}
                  onPress={() => handleDigitPress(key)}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 60,
                    borderRadius: 14,
                    backgroundColor: pressed ? Colors.primarySoft : Colors.surface,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  })}
                >
                  <AppText variant="screenTitle" weight="bold">
                    {displayDigit}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
