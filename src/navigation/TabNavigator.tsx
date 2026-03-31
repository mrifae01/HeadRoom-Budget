/**
 * TabNavigator — root bottom-tab navigation for Headroom.
 *
 * • Mobile  → React Navigation bottom tabs, original appearance unchanged
 * • Desktop → custom flex-row layout (sidebar + content), no React Navigation
 *             tab bar involved so there are no absolute-positioning quirks.
 *             All screens stay mounted; inactive ones are hidden via display:'none'
 *             so component state (chat history, scroll position, etc.) is preserved.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { typography, spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useIsDesktop } from '../hooks/useIsDesktop';

import SetupScreen     from '../screens/SetupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import BankScreen      from '../screens/BankScreen';
import AIAdvisorScreen from '../screens/AIAdvisorScreen';
import SettingsScreen  from '../screens/SettingsScreen';
import GoalsScreen     from '../screens/GoalsScreen';

const ICONS: Record<string, string> = {
  Setup:        '⚙',
  Dashboard:    '◉',
  Bank:         '🏦',
  Goals:        '🎯',
  'AI Advisor': '✦',
  Settings:     '☰',
};

// ─── Desktop layout ────────────────────────────────────────────────────────────

const TABS = ['Setup', 'Dashboard', 'Bank', 'Goals', 'AI Advisor', 'Settings'] as const;
type TabName = typeof TABS[number];

const SCREEN_MAP: Record<TabName, React.ComponentType<any>> = {
  'Setup':      SetupScreen,
  'Dashboard':  DashboardScreen,
  'Bank':       BankScreen,
  'Goals':      GoalsScreen,
  'AI Advisor': AIAdvisorScreen,
  'Settings':   SettingsScreen,
};

function DesktopLayout() {
  const [active, setActive] = React.useState<TabName>('Dashboard');
  const { colors } = useTheme();

  return (
    <View style={[desktop.shell, { backgroundColor: colors.background }]}>

      {/* Top nav bar */}
      <View style={[desktop.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={desktop.topBarInner}>
          <Text style={[desktop.logo, { color: colors.primary }]}>✦ HeadRoom</Text>

          <View style={desktop.navItems}>
            {TABS.map((tab) => {
              const focused = tab === active;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActive(tab)}
                  style={[desktop.navItem, focused && { backgroundColor: colors.primaryLight }]}
                  accessibilityRole="button"
                  accessibilityLabel={tab}
                >
                  <Text style={desktop.navIcon}>{ICONS[tab]}</Text>
                  <Text style={[
                    desktop.navLabel,
                    {
                      color: focused ? colors.primary : colors.textSecondary,
                      fontWeight: focused ? typography.semibold : typography.regular,
                    },
                  ]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Content — all screens mounted, only active one visible */}
      <View style={desktop.content}>
        {TABS.map((tab) => {
          const Screen = SCREEN_MAP[tab];
          return (
            <View key={tab} style={[desktop.screen, { display: tab === active ? 'flex' : 'none' }]}>
              <Screen />
            </View>
          );
        })}
      </View>

    </View>
  );
}

const desktop = StyleSheet.create({
  shell: {
    flex: 1,
  },
  topBar: {
    borderBottomWidth: 1,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 1200,
    width: '100%' as any,
    alignSelf: 'center',
    paddingHorizontal: spacing[6],
    height: 56,
    gap: spacing[8],
  },
  logo: {
    fontSize: typography.md,
    fontWeight: typography.bold,
  },
  navItems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
  },
  navIcon: { fontSize: 15 },
  navLabel: { fontSize: typography.sm },
  content: {
    flex: 1,
    maxWidth: 1200,
    width: '100%' as any,
    alignSelf: 'center',
  },
  screen: {
    flex: 1,
  },
});

// ─── Mobile bottom tab bar ─────────────────────────────────────────────────────
// Pixel-identical to the original.

function MobileTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[mobile.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={mobile.tab}
            accessibilityRole="button"
            accessibilityLabel={route.name}
          >
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>
              {ICONS[route.name] ?? '●'}
            </Text>
            <Text style={[mobile.label, { color: focused ? colors.primary : colors.textMuted }]}>
              {route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const mobile = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    height: 72,
    paddingBottom: spacing[4],
    paddingTop: spacing[2],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
    marginTop: 2,
  },
});

// ─── Root export ───────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const isDesktop = useIsDesktop();

  if (isDesktop) return <DesktopLayout />;

  return (
    <Tab.Navigator
      tabBar={(props) => <MobileTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Setup"       component={SetupScreen}     />
      <Tab.Screen name="Dashboard"   component={DashboardScreen} />
      <Tab.Screen name="Bank"        component={BankScreen}      />
      <Tab.Screen name="Goals"       component={GoalsScreen}     />
      <Tab.Screen
        name="AI Advisor"
        component={AIAdvisorScreen}
        options={{ tabBarHideOnKeyboard: true }}
      />
      <Tab.Screen name="Settings"    component={SettingsScreen}  />
    </Tab.Navigator>
  );
}
