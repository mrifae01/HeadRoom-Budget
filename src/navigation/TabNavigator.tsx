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
import { Text, View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { typography, spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useIsDesktop } from '../hooks/useIsDesktop';

import SetupScreen     from '../screens/SetupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import BudgetScreen    from '../screens/BudgetScreen';
import BankScreen      from '../screens/BankScreen';
import AIAdvisorScreen from '../screens/AIAdvisorScreen';
import SettingsScreen  from '../screens/SettingsScreen';
import GoalsScreen     from '../screens/GoalsScreen';

const ICONS: Record<string, string> = {
  Setup:          '⚙',
  Dashboard:      '◉',
  Budget:         '💰',
  Bank:           '🏦',
  Goals:          '🎯',
  'AI Assistant': '✦',
  Settings:       '☰',
};

// Nav items split: main nav on left, utility items on right
const MAIN_TABS:    TabName[] = ['Dashboard', 'Budget', 'Bank', 'Goals', 'AI Assistant'];
const UTILITY_TABS: TabName[] = ['Setup', 'Settings'];

// ─── Desktop layout ────────────────────────────────────────────────────────────

const TABS = ['Dashboard', 'Budget', 'Bank', 'Goals', 'AI Assistant', 'Setup', 'Settings'] as const;
type TabName = typeof TABS[number];

const SCREEN_MAP: Record<TabName, React.ComponentType<any>> = {
  'Dashboard':    DashboardScreen,
  'Budget':       BudgetScreen,
  'Bank':         BankScreen,
  'Goals':        GoalsScreen,
  'AI Assistant': AIAdvisorScreen,
  'Setup':        SetupScreen,
  'Settings':     SettingsScreen,
};

function NavItem({ tab, active, onPress, colors }: {
  tab: TabName;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <TouchableOpacity
      onPress={onPress}
      // @ts-ignore — web only hover events
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={[
        desktop.navItem,
        active && { backgroundColor: colors.primaryLight },
        !active && hovered && { backgroundColor: colors.surfaceAlt },
      ]}
      accessibilityRole="button"
      accessibilityLabel={tab}
    >
      <Text style={[desktop.navIcon, { opacity: active ? 1 : 0.6 }]}>{ICONS[tab]}</Text>
      <Text style={[
        desktop.navLabel,
        {
          color: active ? colors.primary : colors.textSecondary,
          fontWeight: active ? typography.semibold : typography.regular,
        },
      ]}>
        {tab}
      </Text>
      {active && <View style={[desktop.navUnderline, { backgroundColor: colors.primary }]} />}
    </TouchableOpacity>
  );
}

function DesktopLayout() {
  const [active, setActive] = React.useState<TabName>('Dashboard');
  const { colors } = useTheme();

  return (
    <View style={[desktop.shell, { backgroundColor: colors.background }]}>

      {/* Top nav bar */}
      <View style={[desktop.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={desktop.topBarInner}>

          {/* Logo */}
          <TouchableOpacity
            onPress={() => setActive('Dashboard')}
            style={desktop.logoWrapper}
            accessibilityRole="button"
            accessibilityLabel="Go to Dashboard"
          >
            <Image
              source={require('../../assets/icon.png')}
              style={desktop.logoMark}
              resizeMode="contain"
            />
            <Text style={[desktop.logoText, { color: colors.textPrimary }]}>
              Head<Text style={{ color: colors.primary }}>Room</Text>
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={[desktop.divider, { backgroundColor: colors.border }]} />

          {/* Main nav */}
          <View style={desktop.navItems}>
            {MAIN_TABS.map((tab) => (
              <NavItem
                key={tab}
                tab={tab}
                active={tab === active}
                onPress={() => setActive(tab)}
                colors={colors}
              />
            ))}
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Utility nav */}
          <View style={desktop.navItems}>
            {UTILITY_TABS.map((tab) => (
              <NavItem
                key={tab}
                tab={tab}
                active={tab === active}
                onPress={() => setActive(tab)}
                colors={colors}
              />
            ))}
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
    // Subtle shadow under nav
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%' as any,
    paddingHorizontal: spacing[6],
    height: 60,
    gap: spacing[4],
  },
  logoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingRight: spacing[2],
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  logoText: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    letterSpacing: -0.3,
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: spacing[2],
  },
  navItems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    position: 'relative' as any,
  },
  navUnderline: {
    position: 'absolute' as any,
    bottom: -1,
    left: spacing[3],
    right: spacing[3],
    height: 2,
    borderRadius: radius.full,
  },
  navIcon: { fontSize: 14 },
  navLabel: { fontSize: typography.sm },
  content: {
    flex: 1,
    width: '100%' as any,
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
      <Tab.Screen name="Dashboard"   component={DashboardScreen} />
      <Tab.Screen name="Budget"      component={BudgetScreen}    />
      <Tab.Screen name="Bank"        component={BankScreen}      />
      <Tab.Screen name="Goals"       component={GoalsScreen}     />
      <Tab.Screen
        name="AI Assistant"
        component={AIAdvisorScreen}
        options={{ tabBarHideOnKeyboard: true }}
      />
      <Tab.Screen name="Setup"       component={SetupScreen}     />
      <Tab.Screen name="Settings"    component={SettingsScreen}  />
    </Tab.Navigator>
  );
}
