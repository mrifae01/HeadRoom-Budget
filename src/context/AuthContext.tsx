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

  signOut: () => Promise<void>;
}

// ─── Context + hook ───────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

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
    const { data, error } = await supabase.auth.signUp({ email, password });
    return {
      error:               error?.message ?? null,
      needsConfirmation:   !error && !data.session, // no session = email confirm required
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
    }}>
      {children}
    </AuthContext.Provider>
  );
}
