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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { API_BASE_URL } from '../config/api';
import { TellerAccount, TellerTransaction, TellerEnrollment } from '../types/teller';

const CAT_OVERRIDES_KEY = '@headroom:bank_cat_overrides';

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
  isConnected:       boolean;
  isLoading:         boolean;
  institutionName:   string | null;
  accounts:          TellerAccount[];
  transactions:      TellerTransaction[];
  justConnected:     boolean;
  /** txId → category key overrides set by the user */
  categoryOverrides: Record<string, string>;

  connect:              (enrollment: TellerEnrollment) => Promise<void>;
  reconnect:            ()                              => Promise<boolean>;
  disconnect:           ()                              => Promise<void>;
  refresh:              ()                              => Promise<void>;
  clearJustConnected:   ()                              => void;
  /** Persist a user-chosen category override for a transaction. */
  setCategoryOverride:  (txId: string, catKey: string) => Promise<void>;
  /** Remove a user override and revert to auto-resolve. */
  clearCategoryOverride: (txId: string) => Promise<void>;
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
  const [isConnected,       setIsConnected]       = useState(false);
  const [isLoading,         setIsLoading]         = useState(true);
  const [institutionName,   setInstitutionName]   = useState<string | null>(null);
  const [accounts,          setAccounts]          = useState<TellerAccount[]>([]);
  const [transactions,      setTransactions]      = useState<TellerTransaction[]>([]);
  const [justConnected,     setJustConnected]     = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  // ── Load persisted category overrides ─────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(CAT_OVERRIDES_KEY).then((raw) => {
      if (raw) {
        try { setCategoryOverrides(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, []);

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

  const reconnect = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res  = await authFetch('/api/teller/reconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Reconnect failed');

      if (!data.reconnected) return false;

      setInstitutionName(data.institutionName ?? null);
      await fetchAccounts();
      await fetchTransactions();
      setJustConnected(true);
      return true;
    } catch (err) {
      console.warn('[BankContext] reconnect failed:', err);
      return false;
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

  const setCategoryOverride = useCallback(async (txId: string, catKey: string): Promise<void> => {
    setCategoryOverrides((prev) => {
      const next = { ...prev, [txId]: catKey };
      AsyncStorage.setItem(CAT_OVERRIDES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearCategoryOverride = useCallback(async (txId: string): Promise<void> => {
    setCategoryOverrides((prev) => {
      const next = { ...prev };
      delete next[txId];
      AsyncStorage.setItem(CAT_OVERRIDES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
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
      categoryOverrides,
      connect,
      reconnect,
      disconnect,
      refresh,
      clearJustConnected,
      setCategoryOverride,
      clearCategoryOverride,
    }}>
      {children}
    </BankContext.Provider>
  );
}
