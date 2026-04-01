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
import { BankProvider }   from './src/context/BankContext';
import RootNavigator from './src/navigation/RootNavigator';
import { Analytics } from '@vercel/analytics/react';

export default function App() {
  return (
    // ThemeProvider outermost — every screen + navigator can call useTheme()
    // AuthProvider next   — RootNavigator reads session to decide which stack to show
    // BudgetProvider      — all app screens can call useBudget()
    // BankProvider last   — needs auth (session JWT) to call the backend
    <ThemeProvider>
      <AuthProvider>
        <BudgetProvider>
          <BankProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
            <Analytics />
          </BankProvider>
        </BudgetProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
