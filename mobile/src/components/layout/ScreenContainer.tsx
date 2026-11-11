import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Layout } from '@/theme/tokens';

export interface ScreenContainerProps extends ViewProps {
  scrollable?: boolean;
  padded?: boolean;
}

export function ScreenContainer({
  scrollable = true,
  padded = true,
  style,
  children,
  ...rest
}: ScreenContainerProps) {
  const paddingValue = padded ? Layout.screenPadding : 0;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scrollable ? (
          <ScrollView
            contentContainerStyle={{
              padding: paddingValue,
              gap: 16,
              flexGrow: 1,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1, padding: paddingValue }, style]} {...rest}>
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
