/**
 * API configuration for the Headroom backend.
 *
 * Backend is deployed to Railway — always use the Railway URL.
 * Swap API_BASE_URL back to DEV_URL if running the backend locally.
 *
 * Local dev (when running `node server.js` locally):
 *   Android Emulator → 10.0.2.2:3001
 *   iOS physical device → your machine's local IP e.g. 192.168.x.x:3001
 */

import { Platform } from 'react-native';

const DEV_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'      // Android emulator → host machine
  : Platform.OS === 'web'
    ? 'http://localhost:3001'    // Web browser → local backend
    : 'http://192.168.4.32:3001'; // iOS physical device → host machine IP

const PROD_URL = 'https://headroom-production.up.railway.app';

export const API_BASE_URL: string = __DEV__ ? DEV_URL : PROD_URL;
