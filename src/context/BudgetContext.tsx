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
  useRef,
  ReactNode,
} from 'react';
import { BudgetData, IncomeSource, DebtItem, CategoryItem, Transaction, MonthlyRecord } from '../types/budget';
import {
  saveBudget as persistBudget,
  writeRaw,
  loadBudget,
} from '../storage/budget';
import { saveMonthlyRecord, loadMonthlyRecord } from '../storage/reports';
import { findPreset } from '../data/categories';

// ─── Month-key helpers ────────────────────────────────────────────────────────

/** Returns the current calendar month as "YYYY-MM". */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns the month before the given "YYYY-MM" key. */
function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ─── Auto-archive helper ──────────────────────────────────────────────────────

/**
 * Scans `budget.transactions` for entries belonging to months before the
 * current calendar month.  Each past month gets a `MonthlyRecord` saved
 * to AsyncStorage (skipped if it already exists so we never overwrite).
 * Returns the budget with only current-month transactions remaining so the
 * live Dashboard always shows a clean slate.
 */
async function archivePreviousMonths(budget: BudgetData): Promise<BudgetData> {
  const now          = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Collect transactions that belong to previous months
  const pastTxByMonth = new Map<string, Transaction[]>();
  for (const tx of budget.transactions) {
    const m = tx.date.slice(0, 7); // 'YYYY-MM'
    if (m < currentMonth) {
      if (!pastTxByMonth.has(m)) pastTxByMonth.set(m, []);
      pastTxByMonth.get(m)!.push(tx);
    }
  }

  if (pastTxByMonth.size === 0) return budget; // nothing to archive

  const totalIncome   = budget.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const debtTotal     = budget.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const totalBudgeted = budget.categories.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

  for (const [month, txs] of pastTxByMonth.entries()) {
    // Don't overwrite an existing archive (user may have opened the app multiple
    // times in the same new month — we only want the first archive to stick)
    const alreadyArchived = await loadMonthlyRecord(month);
    if (alreadyArchived) continue;

    const categoryBreakdown = budget.categories.map((cat) => ({
      name:  cat.name,
      icon:  cat.icon,
      color: cat.color,
      spent: txs
        .filter((t) => t.categoryName === cat.name)
        .reduce((s, t) => s + t.amount, 0),
      limit: parseFloat(cat.amount) || 0,
    }));

    // Include "Other/Misc" spending that doesn't match any named category
    const knownNames = new Set(budget.categories.map((c) => c.name));
    const otherSpent = txs
      .filter((t) => !knownNames.has(t.categoryName))
      .reduce((s, t) => s + t.amount, 0);
    if (otherSpent > 0) {
      categoryBreakdown.push({
        name: 'Other/Misc', icon: '📦', color: '#94A3B8',
        spent: otherSpent, limit: 0,
      });
    }

    const totalSpent = txs.reduce((s, t) => s + t.amount, 0);

    const record: MonthlyRecord = {
      month,
      income:     totalIncome,
      debtTotal,
      categories: budget.categories.map((c) => ({
        name:        c.name,
        icon:        c.icon,
        color:       c.color,
        budgetLimit: parseFloat(c.amount) || 0,
      })),
      transactions: txs,
      summary: {
        totalSpent,
        totalBudgeted,
        savingsRate: totalIncome > 0
          ? Math.max(0, Math.min(1, (totalIncome - totalSpent) / totalIncome))
          : 0,
        categoryBreakdown,
      },
    };

    await saveMonthlyRecord(record);
  }

  // Strip past transactions from the live budget
  const currentTxs = budget.transactions.filter((t) => t.date.slice(0, 7) >= currentMonth);
  return { ...budget, transactions: currentTxs };
}

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
  lastArchivedMonth: null,
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

  /**
   * Update a debt's currentBalance (e.g. after a payment is logged).
   * Auto-saves silently. Pass '0' when fully paid off.
   */
  updateDebtBalance: (debtId: string, newBalance: string) => Promise<void>;

  /**
   * True when the app detects the calendar month has changed and the user
   * has not yet confirmed moving into the new month.
   * Drives the month-end prompt on the Dashboard.
   */
  monthEndPending: boolean;

  /**
   * User confirmed they are ready to start the new month.
   * Archives previous-month transactions into a MonthlyRecord, removes them
   * from the live budget, and clears the pending flag.
   */
  confirmMonthEnd: () => Promise<void>;

  /**
   * Dev utility: resets lastArchivedMonth to the previous month so the
   * month-end prompt appears on the Dashboard, simulating a real rollover.
   */
  simulateMonthEnd: () => Promise<void>;
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
  const [budget,          setBudget]          = useState<BudgetData>(DEFAULT_BUDGET);
  const [isLoading,       setIsLoading]       = useState(true);
  const [monthEndPending, setMonthEndPending] = useState(false);

  // Always-current snapshot for use inside async callbacks without stale closures
  const budgetRef = useRef<BudgetData>(DEFAULT_BUDGET);
  useEffect(() => { budgetRef.current = budget; }, [budget]);

  // Load persisted data on mount and detect month rollovers
  useEffect(() => {
    loadBudget()
      .then(async (saved) => {
        const currentMonth = currentMonthKey();

        if (saved) {
          const merged: BudgetData = {
            ...DEFAULT_BUDGET,
            ...saved,
            transactions:      saved.transactions      ?? [],
            lastArchivedMonth: saved.lastArchivedMonth ?? null,
          };

          if (!merged.lastArchivedMonth) {
            // First launch — silently initialise, nothing to archive yet
            const initialised = { ...merged, lastArchivedMonth: currentMonth };
            setBudget(initialised);
            writeRaw(initialised).catch((err) =>
              console.warn('[BudgetContext] Init lastArchivedMonth failed:', err),
            );
          } else if (merged.lastArchivedMonth !== currentMonth) {
            // The month has rolled over — surface the prompt to the user
            setBudget(merged);
            setMonthEndPending(true);
          } else {
            // Same month as last confirmed — nothing to do
            setBudget(merged);
          }
        }
      })
      .catch((err) => {
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
    // Keep existing transactions and month tracking when saving setup changes
    const payload = {
      ...data,
      transactions:      budget.transactions,
      lastArchivedMonth: budget.lastArchivedMonth,
    };
    await persistBudget(payload);
    const updated: BudgetData = { ...payload, lastSaved: new Date().toISOString() };
    setBudget(updated);
    return updated;
  }, [budget.transactions, budget.lastArchivedMonth]);

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
      const tx = prev.transactions.find((t) => t.id === id);

      // If this transaction was a debt payment, restore the amount to currentBalance
      const matchingDebt = tx
        ? prev.debts.find((d) => d.name === tx.categoryName)
        : undefined;
      const updatedDebts =
        matchingDebt && matchingDebt.currentBalance !== undefined
          ? prev.debts.map((d) =>
              d.id === matchingDebt.id
                ? { ...d, currentBalance: (parseFloat(d.currentBalance!) + tx!.amount).toString() }
                : d,
            )
          : prev.debts;

      const updated: BudgetData = {
        ...prev,
        debts: updatedDebts,
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

  // ── Confirm month-end: archive previous month then clear pending flag ─────────
  const confirmMonthEnd = useCallback(async (): Promise<void> => {
    const currentMonth = currentMonthKey();
    setMonthEndPending(false);
    try {
      const cleaned = await archivePreviousMonths(budgetRef.current);
      const updated: BudgetData = { ...cleaned, lastArchivedMonth: currentMonth };
      setBudget(updated);
      writeRaw(updated).catch((err) =>
        console.error('[BudgetContext] Post-confirm persist failed:', err),
      );
    } catch (err) {
      console.error('[BudgetContext] confirmMonthEnd archive failed:', err);
      // At minimum update lastArchivedMonth so the prompt doesn't loop
      setBudget((prev) => {
        const fallback = { ...prev, lastArchivedMonth: currentMonth };
        writeRaw(fallback).catch(console.error);
        return fallback;
      });
    }
  }, []);

  // ── Simulate month-end: build a real report from current data, then prompt ────
  const simulateMonthEnd = useCallback(async (): Promise<void> => {
    const current    = budgetRef.current;
    const thisMonth  = currentMonthKey();

    // Build a MonthlyRecord from current-month transactions so the Reports
    // screen actually has data to display after the user confirms.
    const totalIncome   = current.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const debtTotal     = current.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const totalBudgeted = current.categories.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

    const currentTxs = current.transactions.filter((t) => t.date.startsWith(thisMonth));

    const categoryBreakdown = current.categories.map((cat) => ({
      name:  cat.name,
      icon:  cat.icon,
      color: cat.color,
      spent: currentTxs
        .filter((t) => t.categoryName === cat.name)
        .reduce((s, t) => s + t.amount, 0),
      limit: parseFloat(cat.amount) || 0,
    }));

    const knownNames = new Set(current.categories.map((c) => c.name));
    const otherSpent = currentTxs
      .filter((t) => !knownNames.has(t.categoryName))
      .reduce((s, t) => s + t.amount, 0);
    if (otherSpent > 0) {
      categoryBreakdown.push({ name: 'Other/Misc', icon: '📦', color: '#94A3B8', spent: otherSpent, limit: 0 });
    }

    const totalSpent = currentTxs.reduce((s, t) => s + t.amount, 0);

    const record: MonthlyRecord = {
      month:        thisMonth,
      income:       totalIncome,
      debtTotal,
      categories:   current.categories.map((c) => ({
        name: c.name, icon: c.icon, color: c.color, budgetLimit: parseFloat(c.amount) || 0,
      })),
      transactions: currentTxs,
      summary: {
        totalSpent,
        totalBudgeted,
        savingsRate: totalIncome > 0
          ? Math.max(0, Math.min(1, (totalIncome - totalSpent) / totalIncome))
          : 0,
        categoryBreakdown,
      },
    };

    // Save the report now (overwrite if already exists — this is a dev tool)
    await saveMonthlyRecord(record).catch((err) =>
      console.error('[BudgetContext] Simulate report save failed:', err),
    );

    // Rewind lastArchivedMonth so the month-end prompt appears on the Dashboard
    const prev = prevMonthKey(thisMonth);
    setBudget((b) => {
      const updated = { ...b, lastArchivedMonth: prev };
      writeRaw(updated).catch((err) =>
        console.error('[BudgetContext] Simulate persist failed:', err),
      );
      return updated;
    });
    setMonthEndPending(true);
  }, []);

  // ── Update a debt's current balance after a payment ──────────────────────────
  const updateDebtBalance = useCallback(async (debtId: string, newBalance: string): Promise<void> => {
    setBudget((prev) => {
      const updated: BudgetData = {
        ...prev,
        debts: prev.debts.map((d) =>
          d.id === debtId ? { ...d, currentBalance: newBalance } : d,
        ),
      };
      writeRaw(updated).catch((err) =>
        console.error('[BudgetContext] updateDebtBalance auto-save failed:', err),
      );
      return updated;
    });
  }, []);

  return (
    <BudgetContext.Provider value={{
      budget, isLoading,
      saveBudget, addTransaction, editTransaction, deleteTransaction,
      applyAdjustments, updateDebtBalance,
      monthEndPending, confirmMonthEnd, simulateMonthEnd,
    }}>
      {children}
    </BudgetContext.Provider>
  );
}
