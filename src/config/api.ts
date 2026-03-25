/**
 * API configuration for the Headroom backend.
 *
 * Development:
 *   iOS Simulator  → localhost resolves correctly
 *   Android Emulator → 10.0.2.2 maps to the host machine's localhost
 *
 * Production:
 *   Replace the string below with your deployed URL before shipping
 *   (e.g. https://headroom-api.vercel.app or https://api.yourapp.com)
 */

import { Platform } from 'react-native';

const DEV_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'      // Android emulator → host machine
  : 'http://192.168.4.32:3001'; // iOS physical device → host machine IP

const PROD_URL = 'https://YOUR_PRODUCTION_URL_HERE';

export const API_BASE_URL: string = __DEV__ ? DEV_URL : PROD_URL;
