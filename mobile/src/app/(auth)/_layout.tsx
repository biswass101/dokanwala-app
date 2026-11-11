import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="pin-unlock" />
      <Stack.Screen name="setup-pin" />
    </Stack>
  );
}
