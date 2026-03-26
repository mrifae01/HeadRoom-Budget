/**
 * Supabase client — shared singleton used by auth and (later) database calls.
 *
 * Setup:
 *  1. Go to https://supabase.com → your project → Settings → API
 *  2. Copy "Project URL" and "anon public" key
 *  3. Replace the two placeholder strings below
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://mfpobgljsnmkfjcomkbg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mcG9iZ2xqc25ta2ZqY29ta2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NzE0NDgsImV4cCI6MjA5MDA0NzQ0OH0.o7UVr3feS8l3iy-mGxWcFqd_FtrR2g8N34lR5yvGNdo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:            AsyncStorage, // persist session across app restarts
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,        // not a web app
  },
});
