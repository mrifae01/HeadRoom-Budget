/**
 * BudgetContext — app-wide budget state.
 *
 * Wraps the app so any screen can read or update budget data without
 * prop-drilling. Handles the load-on-startup and save logic.
 *
 * Usage:
 *   const { budget, saveBudget, isLoading } = useBudget();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { BudgetData, IncomeSource, DebtItem, CategoryItem, Transaction } from '../types/budget';
import {
  saveBudget as persistBudget,
  writeRaw,
  loadBudget,
} from '../storage/budget';
import { findPreset } from '../data/categories';

// ─── Seed / default data shown before the user saves for the first time ───────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_BUDGET: BudgetData = {
  incomeSources: [
    { id: uid(), name: 'Main Job', type: 'income', amount: '4200' },
  ],
  debts: [
    { id: uid(), name: 'Student Loan', amount: '320' },
    { id: uid(), name: 'Car Payment',  amount: '450' },
  ],
  categories: [
    { id: uid(), amount: '1400', ...findPreset('Rent/Mortgage')!  },
    { id: uid(), amount: '350',  ...findPreset('Groceries')!      },
    { id: uid(), amount: '120',  ...findPreset('Utilities')!      },
    { id: uid(), amount: '80',   ...findPreset('Entertainment')!  },
  ],
  transactions: [],
  lastSaved: null,
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface BudgetContextValue {
  /** The current in-memory budget. Always populated (falls back to defaults). */
  budget: BudgetData;

  /** True while the initial AsyncStorage load is in progress. */
  isLoading: boolean;

  /**
   * Persist a new budget to AsyncStorage and update the in-memory state.
   * Returns the saved data (with lastSaved stamped) on success.
   * Throws on failure so the caller can show an error message.
   */
  saveBudget: (data: {
    incomeSources: IncomeSource[];
    debts: DebtItem[];
    categories: CategoryItem[];
  }) => Promise<BudgetData>;

  /**
   * Append a transaction, auto-save silently to AsyncStorage.
   * Does NOT update lastSaved — that timestamp is reserved for setup saves.
   */
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<void>;

  /** Update an existing transaction by id. Auto-saves silently. */
  editTransaction: (id: string, updates: Omit<Transaction, 'id'>) => Promise<void>;

  /** Remove a transaction by id. Auto-saves silently. */
  deleteTransaction: (id: string) => Promise<void>;

  /**
   * Apply AI-suggested category budget changes.
   * Each entry maps a category name to a new monthly limit.
   * Auto-saves silently — same behaviour as transaction mutations.
   */
  applyAdjustments: (
    adjustments: { categoryName: string; newAmount: number }[],
  ) => Promise<void>;
}

// ─── Context + hook ───────────────────────────────────────────────────────────

const BudgetContext = createContext<BudgetContextValue | null>(null);

/** Access budget data and actions from any screen. */
export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) {
    throw new Error('useBudget must be used inside <BudgetProvider>');
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [budget,    setBudget]    = useState<BudgetData>(DEFAULT_BUDGET);
  const [isLoading, setIsLoading] = useState(true);

  // Load persisted data once on mount
  useEffect(() => {
    loadBudget()
      .then((saved) => {
        if (saved) {
          // Merge with DEFAULT_BUDGET so any fields added after the initial
          // save (e.g. `transactions`) are safely backfilled with empty defaults
          // rather than coming back as undefined.
          setBudget({
            ...DEFAULT_BUDGET,
            ...saved,
            transactions: saved.transactions ?? [],
          });
        }
      })
      .catch((err) => {
        // Non-fatal: fall back to defaults
        console.warn('[BudgetContext] Failed to load budget:', err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // ── Setup save (stamps lastSaved) ────────────────────────────────────────────
  const saveBudget = useCallback(async (data: {
    incomeSources: IncomeSource[];
    debts: DebtItem[];
    categories: CategoryItem[];
  }): Promise<BudgetData> => {
    // Keep existing transactions when saving setup changes
    const payload = { ...data, transactions: budget.transactions };
    await persistBudget(payload);
    const updated: BudgetData = { ...payload, lastSaved: new Date().toISOString() };
    setBudget(updated);
    return updated;
  }, [budget.transactions]);

  // ── Transaction auto-save (does NOT stamp lastSaved) ─────────────────────────
  const addTransaction = useCallback(async (tx: Omit<Transaction, 'id'>): Promise<void> => {
    const newTx: Transaction = { ...tx, id: uid() };
    // Use functional update so we always work with the latest state
    setBudget((prev) => {
      const updated: BudgetData = {
        ...prev,
        transactions: [...prev.transactions, newTx],
      };
      // Fire-and-forget persist — errors are logged, not surfaced to the user
      writeRaw(updated).catch((err) =>
        console.error('[BudgetContext] Transaction auto-save failed:', err),
      );
      return updated;
    });
  }, []);

  // ── Edit an existing transaction ─────────────────────────────────────────────
  const editTransaction = useCallback(
    async (id: string, updates: Omit<Transaction, 'id'>): Promise<void> => {
      setBudget((prev) => {
        const updated: BudgetData = {
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === id ? { ...updates, id } : t,
          ),
        };
        writeRaw(updated).catch((err) =>
          console.error('[BudgetContext] Edit auto-save failed:', err),
        );
        return updated;
      });
    },
    [],
  );

  // ── Delete a transaction ──────────────────────────────────────────────────────
  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    setBudget((prev) => {
      const updated: BudgetData = {
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
      };
      writeRaw(updated).catch((err) =>
        console.error('[BudgetContext] Delete auto-save failed:', err),
      );
      return updated;
    });
  }, []);

  // ── Apply AI-suggested category budget adjustments ────────────────────────────
  const applyAdjustments = useCallback(
    async (adjustments: { categoryName: string; newAmount: number }[]): Promise<void> => {
      setBudget((prev) => {
        const updated: BudgetData = {
          ...prev,
          categories: prev.categories.map((cat) => {
            const adj = adjustments.find((a) => a.categoryName === cat.name);
            return adj ? { ...cat, amount: adj.newAmount.toString() } : cat;
          }),
        };
        writeRaw(updated).catch((err) =>
          console.error('[BudgetContext] applyAdjustments auto-save failed:', err),
        );
        return updated;
      });
    },
    [],
  );

  return (
    <BudgetContext.Provider value={{ budget, isLoading, saveBudget, addTransaction, editTransaction, deleteTransaction, applyAdjustments }}>
      {children}
    </BudgetContext.Provider>
  );
}
