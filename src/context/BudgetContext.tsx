/**
 * BudgetContext — app-wide budget state backed by Supabase.
 *
 * Budget setup (income, debts, categories) lives in the `budgets` table.
 * Live transactions live in the `transactions` table (one row each).
 * Archived months live in `monthly_records`.
 *
 * The public API (useBudget hook + BudgetContextValue shape) is unchanged —
 * screens and components don't need to know about the storage layer.
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
import {
  BudgetData,
  IncomeSource,
  DebtItem,
  CategoryItem,
  Transaction,
  MonthlyRecord,
  SavingsGoal,
} from '../types/budget';
import {
  saveBudget    as persistBudget,
  writeRaw,
  loadBudget,
  loadTransactions,
  insertTransaction,
  updateTransaction,
  deleteTransactionById,
  deleteTransactionsBefore,
} from '../storage/budget';
import { saveMonthlyRecord, loadMonthlyRecord } from '../storage/reports';
import { useAuth } from './AuthContext';

// ─── Month-key helpers ────────────────────────────────────────────────────────

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ─── Bi-weekly period helpers ─────────────────────────────────────────────────

/**
 * Returns a stable key for the current bi-weekly period.
 * "YYYY-MM-A" = 1st–15th, "YYYY-MM-B" = 16th–end of month.
 */
function currentBiweeklyKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${now.getDate() <= 15 ? 'A' : 'B'}`;
}

/** Returns the key for the period immediately before the given key. */
function prevBiweeklyKey(key: string): string {
  const half = key.slice(8); // 'A' or 'B'
  if (half === 'B') return key.slice(0, 8) + 'A';
  // half === 'A' → go to previous month's B half
  const [y, m] = [parseInt(key.slice(0, 4)), parseInt(key.slice(5, 7))];
  const prev = new Date(y, m - 2, 1); // month is 0-indexed, m-2 = previous month
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-B`;
}

/** ISO date range for a bi-weekly period key (inclusive). */
function biweeklyRange(key: string): { start: string; end: string } {
  const year  = parseInt(key.slice(0, 4));
  const month = parseInt(key.slice(5, 7)); // 1-indexed
  const half  = key.slice(8);
  if (half === 'A') {
    return {
      start: `${key.slice(0, 7)}-01`,
      end:   `${key.slice(0, 7)}-15`,
    };
  }
  const lastDay = new Date(year, month, 0).getDate(); // month is already 1-indexed so this gives last day
  return {
    start: `${key.slice(0, 7)}-16`,
    end:   `${key.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Calculates the surplus for a given bi-weekly period from live transactions.
 * Returns 0 if the period is not within the currently loaded transactions
 * (i.e. it crossed into a previously archived month).
 */
function calcBiweeklySurplus(budget: BudgetData, periodKey: string): number {
  const { start, end } = biweeklyRange(periodKey);

  // Determine how many days are in the calendar month of this period
  const [y, m] = [parseInt(periodKey.slice(0, 4)), parseInt(periodKey.slice(5, 7))];
  const daysInMonth = new Date(y, m, 0).getDate();

  const half       = periodKey.slice(8);
  const periodDays = half === 'A'
    ? 15
    : daysInMonth - 15;

  const totalIncome    = budget.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDebt      = budget.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const spendable      = Math.max(totalIncome - totalDebt, 0);
  const periodBudget   = (spendable / daysInMonth) * periodDays;

  const debtNames      = new Set(budget.debts.map((d) => d.name));
  const periodSpent    = budget.transactions
    .filter((tx) => tx.date >= start && tx.date <= end && !debtNames.has(tx.categoryName))
    .reduce((s, tx) => s + tx.amount, 0);

  return Math.max(0, periodBudget - periodSpent);
}

// ─── Strip transactions for setup-only writes ─────────────────────────────────

/** Returns BudgetData without the transactions array — safe to pass to writeRaw. */
function setupOnly(b: BudgetData): Omit<BudgetData, 'transactions'> {
  const { transactions: _ignored, ...rest } = b;
  return rest;
}

// ─── Auto-archive helper ──────────────────────────────────────────────────────

/**
 * Archives any transactions from months before the current calendar month.
 * Each past month gets its own MonthlyRecord in Supabase (skipped if one
 * already exists).  Past transactions are then deleted from the `transactions`
 * table and stripped from the returned BudgetData.
 */
async function archivePreviousMonths(
  budget: BudgetData,
  userId: string,
): Promise<BudgetData> {
  const currentMonth = currentMonthKey();

  // Group transactions by month for any month before the current one
  const pastTxByMonth = new Map<string, Transaction[]>();
  for (const tx of budget.transactions) {
    const m = tx.date.slice(0, 7);
    if (m < currentMonth) {
      if (!pastTxByMonth.has(m)) pastTxByMonth.set(m, []);
      pastTxByMonth.get(m)!.push(tx);
    }
  }

  if (pastTxByMonth.size === 0) return budget;

  const totalIncome   = budget.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const debtTotal     = budget.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const totalBudgeted = budget.categories.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

  for (const [month, txs] of pastTxByMonth.entries()) {
    // Don't overwrite an existing archive
    const alreadyArchived = await loadMonthlyRecord(month, userId);
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
      income: totalIncome,
      debtTotal,
      categories: budget.categories.map((c) => ({
        name: c.name, icon: c.icon, color: c.color,
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

    await saveMonthlyRecord(record, userId);
  }

  // Delete past transactions from Supabase, then strip from local state
  await deleteTransactionsBefore(currentMonth, userId);
  const currentTxs = budget.transactions.filter((t) => t.date.slice(0, 7) >= currentMonth);
  return { ...budget, transactions: currentTxs };
}

// ─── Default data shown before the user saves for the first time ──────────────

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const DEFAULT_BUDGET: BudgetData = {
  incomeSources:            [],
  debts:                    [],
  categories:               [],
  transactions:             [],
  lastSaved:                null,
  lastArchivedMonth:        null,
  savingsGoals:             [],
  savingsPool:              0,
  lastSurplusPromptPeriod:  null,
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface BudgetContextValue {
  budget:    BudgetData;
  isLoading: boolean;

  saveBudget: (data: {
    incomeSources: IncomeSource[];
    debts:         DebtItem[];
    categories:    CategoryItem[];
  }) => Promise<BudgetData>;

  addTransaction:    (tx: Omit<Transaction, 'id'>)                          => Promise<void>;
  editTransaction:   (id: string, updates: Omit<Transaction, 'id'>)         => Promise<void>;
  deleteTransaction: (id: string)                                            => Promise<void>;
  applyAdjustments:  (adj: { categoryName: string; newAmount: number }[])   => Promise<void>;
  updateDebtBalance: (debtId: string, newBalance: string)                   => Promise<void>;

  monthEndPending: boolean;
  confirmMonthEnd: () => Promise<void>;
  simulateMonthEnd: () => Promise<void>;

  // ─── Goals & Potential Savings ──────────────────────────────────────────
  /** True when a new bi-weekly period just started and there's surplus to allocate */
  biweeklyEndPending: boolean;
  /** The surplus amount from the period that just ended */
  pendingSurplus: number;
  addGoal:        (goal: Omit<SavingsGoal, 'id' | 'currentAmount' | 'createdAt' | 'completedAt'>) => Promise<void>;
  deleteGoal:     (id: string)                                                                      => Promise<void>;
  /** Move `amount` from the Potential Savings pool into a specific goal */
  contributeToGoal: (goalId: string, amount: number) => Promise<SavingsGoal | null>;
  /** Move the full pending surplus (or a custom amount) into the pool */
  claimSurplusToPool: (amount: number) => Promise<void>;
  /** Dismiss the bi-weekly end prompt without allocating */
  dismissBiweeklyPrompt: () => Promise<void>;
}

// ─── Context + hook ───────────────────────────────────────────────────────────

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used inside <BudgetProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [budget,               setBudget]               = useState<BudgetData>(DEFAULT_BUDGET);
  const [isLoading,            setIsLoading]            = useState(true);
  const [monthEndPending,      setMonthEndPending]      = useState(false);
  const [biweeklyEndPending,   setBiweeklyEndPending]   = useState(false);
  const [pendingSurplus,       setPendingSurplus]       = useState(0);

  // Refs for use inside async callbacks — avoids stale closures
  const budgetRef = useRef<BudgetData>(DEFAULT_BUDGET);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { budgetRef.current = budget; },      [budget]);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user]);

  // ── Load (or reset) when the auth user changes ────────────────────────────
  useEffect(() => {
    if (!user) {
      // Logged out — reset to defaults so no stale data leaks between accounts
      setBudget(DEFAULT_BUDGET);
      budgetRef.current = DEFAULT_BUDGET;
      setMonthEndPending(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    Promise.all([loadBudget(user.id), loadTransactions(user.id)])
      .then(async ([saved, transactions]) => {
        const currentMonth = currentMonthKey();

        if (saved) {
          const merged: BudgetData = {
            ...DEFAULT_BUDGET,
            ...saved,
            transactions,
          };

          if (!merged.lastArchivedMonth) {
            // First launch for this user — initialise silently, nothing to archive
            const initialised = {
              ...merged,
              lastArchivedMonth:       currentMonth,
              lastSurplusPromptPeriod: currentBiweeklyKey(),
            };
            setBudget(initialised);
            writeRaw(setupOnly(initialised), user.id).catch((err) =>
              console.warn('[BudgetContext] Init lastArchivedMonth failed:', err),
            );
          } else if (merged.lastArchivedMonth !== currentMonth) {
            // Month has rolled over — show the prompt
            setBudget(merged);
            setMonthEndPending(true);
          } else {
            setBudget(merged);

            // Check if a new bi-weekly period started since we last prompted
            const curKey  = currentBiweeklyKey();
            const lastKey = merged.lastSurplusPromptPeriod;
            if (lastKey !== curKey) {
              const prevKey = prevBiweeklyKey(curKey);
              // Only prompt if the previous period is within the current calendar month
              // (archived periods aren't in local transactions)
              if (prevKey.slice(0, 7) === currentMonth) {
                const surplus = calcBiweeklySurplus(merged, prevKey);
                if (surplus > 0) {
                  setBiweeklyEndPending(true);
                  setPendingSurplus(surplus);
                } else {
                  // No surplus — silently advance the prompt key
                  const advanced = { ...merged, lastSurplusPromptPeriod: curKey };
                  setBudget(advanced);
                  writeRaw(setupOnly(advanced), user.id).catch(console.error);
                }
              }
            }
          }
        } else {
          // New user — no Supabase row yet, start from defaults
          const initialised = { ...DEFAULT_BUDGET, transactions: [], lastArchivedMonth: currentMonth };
          setBudget(initialised);
        }
      })
      .catch((err) => {
        console.warn('[BudgetContext] Failed to load budget:', err);
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Setup save (stamps lastSaved) ─────────────────────────────────────────
  const saveBudget = useCallback(async (data: {
    incomeSources: IncomeSource[];
    debts:         DebtItem[];
    categories:    CategoryItem[];
  }): Promise<BudgetData> => {
    const userId = userIdRef.current;
    if (!userId) throw new Error('Not signed in');

    const payload = {
      ...data,
      lastArchivedMonth: budgetRef.current.lastArchivedMonth,
    };
    await persistBudget(payload, userId);
    const updated: BudgetData = {
      ...payload,
      transactions: budgetRef.current.transactions,
      lastSaved:    new Date().toISOString(),
    };
    setBudget(updated);
    return updated;
  }, []);

  // ── Add transaction ───────────────────────────────────────────────────────
  const addTransaction = useCallback(async (tx: Omit<Transaction, 'id'>): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;

    const newTx: Transaction = { ...tx, id: uid() };

    // Update local state immediately (optimistic)
    setBudget((prev) => ({ ...prev, transactions: [...prev.transactions, newTx] }));

    // Persist to Supabase
    insertTransaction(newTx, userId).catch((err) =>
      console.error('[BudgetContext] insertTransaction failed:', err),
    );
  }, []);

  // ── Edit transaction ──────────────────────────────────────────────────────
  const editTransaction = useCallback(
    async (id: string, updates: Omit<Transaction, 'id'>): Promise<void> => {
      const userId = userIdRef.current;
      if (!userId) return;

      const updated: Transaction = { ...updates, id };

      setBudget((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => t.id === id ? updated : t),
      }));

      updateTransaction(updated, userId).catch((err) =>
        console.error('[BudgetContext] updateTransaction failed:', err),
      );
    },
    [],
  );

  // ── Delete transaction ────────────────────────────────────────────────────
  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;

    setBudget((prev) => {
      const tx = prev.transactions.find((t) => t.id === id);

      // Restore debt balance if this was a debt payment
      const matchingDebt = tx ? prev.debts.find((d) => d.name === tx.categoryName) : undefined;
      const updatedDebts = matchingDebt && matchingDebt.currentBalance !== undefined
        ? prev.debts.map((d) =>
            d.id === matchingDebt.id
              ? { ...d, currentBalance: (parseFloat(d.currentBalance!) + tx!.amount).toString() }
              : d,
          )
        : prev.debts;

      const next: BudgetData = {
        ...prev,
        debts:        updatedDebts,
        transactions: prev.transactions.filter((t) => t.id !== id),
      };

      // If debts changed, persist the setup update too
      if (updatedDebts !== prev.debts) {
        writeRaw(setupOnly(next), userId).catch((err) =>
          console.error('[BudgetContext] Debt restore write failed:', err),
        );
      }

      return next;
    });

    deleteTransactionById(id, userId).catch((err) =>
      console.error('[BudgetContext] deleteTransaction failed:', err),
    );
  }, []);

  // ── Apply AI-suggested adjustments ───────────────────────────────────────
  const applyAdjustments = useCallback(
    async (adjustments: { categoryName: string; newAmount: number }[]): Promise<void> => {
      const userId = userIdRef.current;
      if (!userId) return;

      setBudget((prev) => {
        const next: BudgetData = {
          ...prev,
          categories: prev.categories.map((cat) => {
            const adj = adjustments.find((a) => a.categoryName === cat.name);
            return adj ? { ...cat, amount: adj.newAmount.toString() } : cat;
          }),
        };
        writeRaw(setupOnly(next), userId).catch((err) =>
          console.error('[BudgetContext] applyAdjustments write failed:', err),
        );
        return next;
      });
    },
    [],
  );

  // ── Update a debt's current balance ──────────────────────────────────────
  const updateDebtBalance = useCallback(
    async (debtId: string, newBalance: string): Promise<void> => {
      const userId = userIdRef.current;
      if (!userId) return;

      setBudget((prev) => {
        const next: BudgetData = {
          ...prev,
          debts: prev.debts.map((d) =>
            d.id === debtId ? { ...d, currentBalance: newBalance } : d,
          ),
        };
        writeRaw(setupOnly(next), userId).catch((err) =>
          console.error('[BudgetContext] updateDebtBalance write failed:', err),
        );
        return next;
      });
    },
    [],
  );

  // ── Confirm month-end ─────────────────────────────────────────────────────
  const confirmMonthEnd = useCallback(async (): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;

    const currentMonth = currentMonthKey();
    setMonthEndPending(false);

    try {
      const cleaned = await archivePreviousMonths(budgetRef.current, userId);
      const updated: BudgetData = { ...cleaned, lastArchivedMonth: currentMonth };
      setBudget(updated);
      writeRaw(setupOnly(updated), userId).catch((err) =>
        console.error('[BudgetContext] Post-confirm write failed:', err),
      );
    } catch (err) {
      console.error('[BudgetContext] confirmMonthEnd failed:', err);
      // At minimum update lastArchivedMonth so the prompt doesn't loop
      setBudget((prev) => {
        const fallback = { ...prev, lastArchivedMonth: currentMonth };
        writeRaw(setupOnly(fallback), userId).catch(console.error);
        return fallback;
      });
    }
  }, []);

  // ── Goals & Potential Savings ─────────────────────────────────────────────

  const addGoal = useCallback(
    async (goal: Omit<SavingsGoal, 'id' | 'currentAmount' | 'createdAt' | 'completedAt'>): Promise<void> => {
      const userId = userIdRef.current;
      if (!userId) return;

      const newGoal: SavingsGoal = {
        ...goal,
        id:            uid(),
        currentAmount: 0,
        createdAt:     new Date().toISOString(),
      };

      setBudget((prev) => {
        const next: BudgetData = { ...prev, savingsGoals: [...prev.savingsGoals, newGoal] };
        writeRaw(setupOnly(next), userId).catch((err) =>
          console.error('[BudgetContext] addGoal write failed:', err),
        );
        return next;
      });
    },
    [],
  );

  const deleteGoal = useCallback(async (id: string): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;

    setBudget((prev) => {
      const goal = prev.savingsGoals.find((g) => g.id === id);
      // Return any saved amount back to the pool
      const refund = goal?.currentAmount ?? 0;
      const next: BudgetData = {
        ...prev,
        savingsGoals: prev.savingsGoals.filter((g) => g.id !== id),
        savingsPool:  prev.savingsPool + refund,
      };
      writeRaw(setupOnly(next), userId).catch((err) =>
        console.error('[BudgetContext] deleteGoal write failed:', err),
      );
      return next;
    });
  }, []);

  /**
   * Move `amount` from the Potential Savings pool into a goal.
   * Returns the updated goal (including completedAt if it was just finished).
   * Returns null if the goal is not found or pool is insufficient.
   */
  const contributeToGoal = useCallback(
    async (goalId: string, amount: number): Promise<SavingsGoal | null> => {
      const userId = userIdRef.current;
      if (!userId || amount <= 0) return null;

      let resultGoal: SavingsGoal | null = null;

      setBudget((prev) => {
        const goal = prev.savingsGoals.find((g) => g.id === goalId);
        if (!goal) return prev;

        const clampedAmount = Math.min(amount, prev.savingsPool);
        if (clampedAmount <= 0) return prev;

        const newCurrent   = goal.currentAmount + clampedAmount;
        const isComplete   = goal.targetAmount > 0 && newCurrent >= goal.targetAmount;
        const updatedGoal: SavingsGoal = {
          ...goal,
          currentAmount: newCurrent,
          ...(isComplete && !goal.completedAt ? { completedAt: new Date().toISOString() } : {}),
        };

        resultGoal = updatedGoal;

        const next: BudgetData = {
          ...prev,
          savingsPool:  prev.savingsPool - clampedAmount,
          savingsGoals: prev.savingsGoals.map((g) => g.id === goalId ? updatedGoal : g),
        };
        writeRaw(setupOnly(next), userId).catch((err) =>
          console.error('[BudgetContext] contributeToGoal write failed:', err),
        );
        return next;
      });

      return resultGoal;
    },
    [],
  );

  /** Add `amount` to the Potential Savings pool (called from bi-weekly end prompt). */
  const claimSurplusToPool = useCallback(async (amount: number): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId || amount <= 0) return;

    const curKey = currentBiweeklyKey();

    setBudget((prev) => {
      const next: BudgetData = {
        ...prev,
        savingsPool:             prev.savingsPool + amount,
        lastSurplusPromptPeriod: curKey,
      };
      writeRaw(setupOnly(next), userId).catch((err) =>
        console.error('[BudgetContext] claimSurplusToPool write failed:', err),
      );
      return next;
    });

    setBiweeklyEndPending(false);
    setPendingSurplus(0);
  }, []);

  /** Dismiss the bi-weekly prompt without adding anything to the pool. */
  const dismissBiweeklyPrompt = useCallback(async (): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;

    const curKey = currentBiweeklyKey();
    setBiweeklyEndPending(false);
    setPendingSurplus(0);

    setBudget((prev) => {
      const next: BudgetData = { ...prev, lastSurplusPromptPeriod: curKey };
      writeRaw(setupOnly(next), userId).catch((err) =>
        console.error('[BudgetContext] dismissBiweeklyPrompt write failed:', err),
      );
      return next;
    });
  }, []);

  // ── Simulate month-end (dev tool) ─────────────────────────────────────────
  const simulateMonthEnd = useCallback(async (): Promise<void> => {
    const userId  = userIdRef.current;
    const current = budgetRef.current;
    if (!userId) return;

    const thisMonth     = currentMonthKey();
    const totalIncome   = current.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const debtTotal     = current.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const totalBudgeted = current.categories.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const currentTxs    = current.transactions.filter((t) => t.date.startsWith(thisMonth));

    const categoryBreakdown = current.categories.map((cat) => ({
      name:  cat.name, icon: cat.icon, color: cat.color,
      spent: currentTxs.filter((t) => t.categoryName === cat.name).reduce((s, t) => s + t.amount, 0),
      limit: parseFloat(cat.amount) || 0,
    }));

    const knownNames = new Set(current.categories.map((c) => c.name));
    const otherSpent = currentTxs.filter((t) => !knownNames.has(t.categoryName)).reduce((s, t) => s + t.amount, 0);
    if (otherSpent > 0) {
      categoryBreakdown.push({ name: 'Other/Misc', icon: '📦', color: '#94A3B8', spent: otherSpent, limit: 0 });
    }

    const totalSpent = currentTxs.reduce((s, t) => s + t.amount, 0);

    const record: MonthlyRecord = {
      month:      thisMonth,
      income:     totalIncome,
      debtTotal,
      categories: current.categories.map((c) => ({
        name: c.name, icon: c.icon, color: c.color, budgetLimit: parseFloat(c.amount) || 0,
      })),
      transactions: currentTxs,
      summary: {
        totalSpent, totalBudgeted,
        savingsRate: totalIncome > 0
          ? Math.max(0, Math.min(1, (totalIncome - totalSpent) / totalIncome))
          : 0,
        categoryBreakdown,
      },
    };

    await saveMonthlyRecord(record, userId).catch((err) =>
      console.error('[BudgetContext] Simulate save failed:', err),
    );

    const prev = prevMonthKey(thisMonth);
    setBudget((b) => {
      const updated = { ...b, lastArchivedMonth: prev };
      writeRaw(setupOnly(updated), userId).catch((err) =>
        console.error('[BudgetContext] Simulate write failed:', err),
      );
      return updated;
    });
    setMonthEndPending(true);
  }, []);

  return (
    <BudgetContext.Provider value={{
      budget, isLoading,
      saveBudget, addTransaction, editTransaction, deleteTransaction,
      applyAdjustments, updateDebtBalance,
      monthEndPending, confirmMonthEnd, simulateMonthEnd,
      biweeklyEndPending, pendingSurplus,
      addGoal, deleteGoal, contributeToGoal, claimSurplusToPool, dismissBiweeklyPrompt,
    }}>
      {children}
    </BudgetContext.Provider>
  );
}
