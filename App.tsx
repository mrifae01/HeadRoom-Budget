/**
 * App.tsx — root of the Headroom app.
 * Sets up the BudgetProvider (data layer) and React Navigation.
 *
 * Provider order matters: BudgetProvider wraps NavigationContainer so
 * every screen — including modals and nested navigators — can call useBudget().
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from './src/context/ThemeContext';
import { BudgetProvider } from './src/context/BudgetContext';
import TabNavigator from './src/navigation/TabNavigator';

export default function App() {
  return (
    // ThemeProvider is outermost so every screen and navigator can call useTheme()
    <ThemeProvider>
      <BudgetProvider>
        <NavigationContainer>
          <TabNavigator />
        </NavigationContainer>
      </BudgetProvider>
    </ThemeProvider>
  );
}
