/**
 * RootNavigator — decides whether to show the auth flow or the main app.
 *
 * Auth states:
 *   isLoading → splash/spinner while the persisted session is being read
 *   !session  → AuthNavigator  (Sign In / Sign Up)
 *   session   → main app stack (Tabs, Reports, MonthDetail)
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth }   from '../context/AuthContext';
import { useTheme }  from '../context/ThemeContext';

import AuthNavigator    from './AuthNavigator';
import TabNavigator     from './TabNavigator';
import ReportsScreen    from '../screens/ReportsScreen';
import MonthDetailScreen from '../screens/MonthDetailScreen';

// ─── Param list ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Main:        undefined;
  Reports:     undefined;
  MonthDetail: { month: string };   // 'YYYY-MM'
};

// ─── Splash shown while session is being restored ─────────────────────────────

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <View style={[styles.loadingCircle, { backgroundColor: colors.primary }]}>
        <Text style={styles.loadingIcon}>✦</Text>
      </View>
      <ActivityIndicator
        style={{ marginTop: 24 }}
        color={colors.primary}
        size="large"
      />
    </View>
  );
}

// ─── Main app stack ───────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main"        component={TabNavigator}      />
      <Stack.Screen name="Reports"     component={ReportsScreen}     />
      <Stack.Screen name="MonthDetail" component={MonthDetailScreen} />
    </Stack.Navigator>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function RootNavigator() {
  const { session, isLoading } = useAuth();

  if (isLoading)  return <LoadingScreen />;
  if (!session)   return <AuthNavigator />;
  return <AppNavigator />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingIcon: { fontSize: 32, color: '#fff' },
});
