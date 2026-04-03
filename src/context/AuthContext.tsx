/**
 * AuthContext — Supabase auth state for the whole app.
 *
 * Provides:
 *   session   — the active Supabase session (null if signed out)
 *   user      — shortcut to session.user
 *   isLoading — true while the initial session check is in progress
 *   signIn / signUp / signOut
 *
 * Usage:
 *   const { user, signOut } = useAuth();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  session:   Session | null;
  user:      User    | null;
  isLoading: boolean;

  /** Returns an error message string, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;

  /**
   * Returns { error, needsConfirmation }.
   * needsConfirmation = true when Supabase requires the user to verify their
   * email before they can sign in (default Supabase behaviour).
   * Disable it in Dashboard → Auth → Settings → "Enable email confirmations".
   */
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;

  /** Version strings for the current legal docs — update when docs change. */
  TOS_VERSION: string;
  PRIVACY_VERSION: string;

  signOut: () => Promise<void>;
}

// ─── Context + hook ───────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ─── Legal doc versions — update these when PP or ToS content changes ─────────

const TOS_VERSION     = '2026-04-02';
const PRIVACY_VERSION = '2026-04-02';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore persisted session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Keep session in sync with Supabase auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session),
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
  ): Promise<{ error: string | null; needsConfirmation: boolean }> => {
    const consentedAt = new Date().toISOString();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Store consent atomically with user creation — survives even if the
        // consents table insert below is skipped due to email confirmation.
        data: {
          tos_consented_at:  consentedAt,
          tos_version:       TOS_VERSION,
          privacy_version:   PRIVACY_VERSION,
        },
      },
    });

    // If the user is immediately authenticated (no email confirmation required),
    // also write a queryable row to the consents table.
    if (!error && data.session && data.user) {
      await supabase.from('consents').insert({
        user_id:         data.user.id,
        consented_at:    consentedAt,
        tos_version:     TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
      });
    }

    return {
      error:             error?.message ?? null,
      needsConfirmation: !error && !data.session,
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      isLoading,
      signIn, signUp, signOut,
      TOS_VERSION,
      PRIVACY_VERSION,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
