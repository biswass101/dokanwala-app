import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { Colors, FontFamilies } from '@/theme/tokens';

export default function TabsLayout() {
  const { t } = useAppTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: FontFamilies.semibold,
          fontSize: 12,
          lineHeight: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="home-outline"
              size={size}
              color={focused ? Colors.primary : Colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: t('tabs.sales'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="cart-outline"
              size={size}
              color={focused ? Colors.primary : Colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: t('tabs.products'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="cube-outline"
              size={size}
              color={focused ? Colors.primary : Colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('tabs.reports'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="bar-chart-outline"
              size={size}
              color={focused ? Colors.primary : Colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="grid-outline"
              size={size}
              color={focused ? Colors.primary : Colors.textSecondary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
