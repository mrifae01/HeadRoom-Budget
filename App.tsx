/**
 * App.tsx — root of the Headroom app.
 * Sets up the BudgetProvider (data layer) and React Navigation.
 *
 * Provider order matters: BudgetProvider wraps NavigationContainer so
 * every screen — including modals and nested navigators — can call useBudget().
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider }  from './src/context/ThemeContext';
import { AuthProvider }   from './src/context/AuthContext';
import { BudgetProvider } from './src/context/BudgetContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    // ThemeProvider outermost — every screen + navigator can call useTheme()
    // AuthProvider next   — RootNavigator reads session to decide which stack to show
    // BudgetProvider last — all app screens can call useBudget()
    <ThemeProvider>
      <AuthProvider>
        <BudgetProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </BudgetProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
