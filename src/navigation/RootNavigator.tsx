/**
 * RootNavigator — top-level Stack navigator for Headroom.
 *
 * The main tab bar lives at "Main".  Full-screen report screens are pushed
 * on top of the tabs so the back gesture works naturally.
 *
 * Stack:
 *   Main           → TabNavigator (all four tabs)
 *   Reports        → ReportsScreen  (list of archived months)
 *   MonthDetail    → MonthDetailScreen  (visualisation for one month)
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import TabNavigator     from './TabNavigator';
import ReportsScreen    from '../screens/ReportsScreen';
import MonthDetailScreen from '../screens/MonthDetailScreen';

// ─── Param list ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Main:        undefined;
  Reports:     undefined;
  MonthDetail: { month: string };   // 'YYYY-MM'
};

// ─── Navigator ────────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main"        component={TabNavigator}      />
      <Stack.Screen name="Reports"     component={ReportsScreen}     />
      <Stack.Screen name="MonthDetail" component={MonthDetailScreen} />
    </Stack.Navigator>
  );
}
