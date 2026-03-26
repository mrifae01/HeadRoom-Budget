/**
 * TabNavigator — root bottom-tab navigation for Headroom.
 * Four tabs: Setup, Dashboard, AI Advisor, Settings.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { typography, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

// Screens
import SetupScreen     from '../screens/SetupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AIAdvisorScreen from '../screens/AIAdvisorScreen';
import SettingsScreen  from '../screens/SettingsScreen';

const ICONS: Record<string, string> = {
  Setup:       '⚙',
  Dashboard:   '◉',
  'AI Advisor':'✦',
  Settings:    '☰',
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>
      {ICONS[label] ?? '●'}
    </Text>
  );
}

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: spacing[4],
          paddingTop: spacing[2],
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: typography.xs,
          fontWeight: typography.medium,
          marginTop: 2,
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Setup"      component={SetupScreen}     />
      <Tab.Screen name="Dashboard"  component={DashboardScreen} />
      <Tab.Screen
        name="AI Advisor"
        component={AIAdvisorScreen}
        options={{ tabBarHideOnKeyboard: true }}
      />
      <Tab.Screen name="Settings"   component={SettingsScreen}  />
    </Tab.Navigator>
  );
}
