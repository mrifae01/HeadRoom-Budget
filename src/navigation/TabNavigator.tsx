/**
 * TabNavigator — root bottom-tab navigation for Headroom.
 * Three tabs: Setup, Dashboard, AI Advisor.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';

// Screens
import SetupScreen from '../screens/SetupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AIAdvisorScreen from '../screens/AIAdvisorScreen';

// Simple SVG-free icon component — replace with react-native-vector-icons later
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Setup: '⚙',
    Dashboard: '◉',
    'AI Advisor': '✦',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>
      {icons[label] ?? '●'}
    </Text>
  );
}

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Setup" component={SetupScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="AI Advisor" component={AIAdvisorScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: spacing[2],
    paddingTop: spacing[1],
  },
  tabLabel: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
    marginTop: 2,
  },
});
