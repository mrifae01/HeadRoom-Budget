import 'react-native-url-polyfill/auto'; // required by Supabase in React Native
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react';

import App from './App';

// Sentry is web-only here — native crash reporting requires @sentry/react-native
// and native build configuration (added when mobile distribution is set up).
if (Platform.OS === 'web' && process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    // Only send errors in production — keeps your free quota clean during dev
    enabled: !__DEV__,
    tracesSampleRate: 0.2, // 20% of transactions — sufficient for 100 users
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
