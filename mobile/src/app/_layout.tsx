import '../../global.css';
import '@/i18n';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  NotoSansBengali_400Regular,
  NotoSansBengali_500Medium,
  NotoSansBengali_600SemiBold,
  NotoSansBengali_700Bold,
} from '@expo-google-fonts/noto-sans-bengali';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingView } from '@/components';
import { useAuthStore } from '@/store/auth.store';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AuthNavigationGate() {
  const status = useAuthStore((state) => state.status);
  const bootstrapSession = useAuthStore((state) => state.bootstrapSession);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    if (status === 'booting') return;

    const segmentList: readonly string[] = segments;
    const firstSegment = segmentList[0];
    const inAuthGroup = firstSegment === '(auth)';
    const secondSegment = segmentList[1];

    if (status === 'unauthenticated') {
      if (!inAuthGroup || secondSegment !== 'login') {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (status === 'locked') {
      if (!inAuthGroup || secondSegment !== 'pin-unlock') {
        router.replace('/(auth)/pin-unlock');
      }
      return;
    }

    if (status === 'authenticated' && inAuthGroup && secondSegment !== 'setup-pin') {
      router.replace('/(tabs)');
    }
  }, [status, segments, router]);

  if (status === 'booting') {
    return <LoadingView />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="shop-settings" />
      <Stack.Screen name="staff" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansBengali_400Regular,
    NotoSansBengali_500Medium,
    NotoSansBengali_600SemiBold,
    NotoSansBengali_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <AuthNavigationGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
