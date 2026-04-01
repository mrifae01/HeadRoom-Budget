/**
 * BankContext — manages Teller bank connection state.
 *
 * All Teller API calls are proxied through the Express backend so the
 * Teller access token never touches the frontend.
 *
 * Provider order in App.tsx: AuthProvider > BudgetProvider > BankProvider
 * (BankProvider needs an authenticated session to call the backend)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '../config/supabase';
import { API_BASE_URL } from '../config/api';
import { TellerAccount, TellerTransaction, TellerEnrollment } from '../types/teller';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJwt(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const jwt = await getJwt();
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface BankContextValue {
  isConnected:     boolean;
  isLoading:       boolean;
  institutionName: string | null;
  accounts:        TellerAccount[];
  transactions:    TellerTransaction[];
  justConnected:   boolean;

  connect:              (enrollment: TellerEnrollment) => Promise<void>;
  disconnect:           ()                              => Promise<void>;
  refresh:              ()                              => Promise<void>;
  clearJustConnected:   ()                              => void;
}

// ─── Context + hook ───────────────────────────────────────────────────────────

const BankContext = createContext<BankContextValue | null>(null);

export function useBank(): BankContextValue {
  const ctx = useContext(BankContext);
  if (!ctx) throw new Error('useBank must be used inside <BankProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BankProvider({ children }: { children: ReactNode }) {
  const [isConnected,     setIsConnected]     = useState(false);
  const [isLoading,       setIsLoading]       = useState(true);
  const [institutionName, setInstitutionName] = useState<string | null>(null);
  const [accounts,        setAccounts]        = useState<TellerAccount[]>([]);
  const [transactions,    setTransactions]    = useState<TellerTransaction[]>([]);
  const [justConnected,   setJustConnected]   = useState(false);

  // ── Internal fetch helpers ─────────────────────────────────────────────────

  const fetchAccounts = useCallback(async (): Promise<void> => {
    try {
      const res  = await authFetch('/api/teller/accounts');
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch accounts');

      setIsConnected(data.connected ?? false);
      setInstitutionName(data.institutionName ?? null);
      setAccounts(data.accounts ?? []);
    } catch (err) {
      console.warn('[BankContext] fetchAccounts failed:', err);
      setIsConnected(false);
      setAccounts([]);
    }
  }, []);

  const fetchTransactions = useCallback(async (): Promise<void> => {
    try {
      const res  = await authFetch('/api/teller/transactions');
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch transactions');

      setTransactions(data.transactions ?? []);
    } catch (err) {
      console.warn('[BankContext] fetchTransactions failed:', err);
      setTransactions([]);
    }
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    setIsLoading(true);
    fetchAccounts()
      .then(() => fetchTransactions())
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  const connect = useCallback(async (enrollment: TellerEnrollment): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await authFetch('/api/teller/enroll', {
        method: 'POST',
        body: JSON.stringify({
          accessToken:     enrollment.accessToken,
          institutionName: enrollment.enrollment.institution.name,
          enrollmentId:    enrollment.enrollment.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Enrollment failed');

      await fetchAccounts();
      await fetchTransactions();
      setJustConnected(true);
    } catch (err) {
      console.error('[BankContext] connect failed:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAccounts, fetchTransactions]);

  const disconnect = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const res  = await authFetch('/api/teller/disconnect', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Disconnect failed');

      setIsConnected(false);
      setInstitutionName(null);
      setAccounts([]);
      setTransactions([]);
    } catch (err) {
      console.error('[BankContext] disconnect failed:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearJustConnected = useCallback((): void => {
    setJustConnected(false);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetchAccounts();
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  }, [fetchAccounts, fetchTransactions]);

  return (
    <BankContext.Provider value={{
      isConnected,
      isLoading,
      institutionName,
      accounts,
      transactions,
      justConnected,
      connect,
      disconnect,
      refresh,
      clearJustConnected,
    }}>
      {children}
    </BankContext.Provider>
  );
}
