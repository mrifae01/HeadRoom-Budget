/**
 * budget.ts — shared data types for the Headroom budget model.
 *
 * These are the single source of truth for the shape of user data.
 * Imported by: SetupScreen, BudgetContext, storage helpers, and
 * eventually the Dashboard and AI Advisor screens.
 */

// ─── Income ───────────────────────────────────────────────────────────────────

/** Whether the source is regular income or a savings draw. */
export type IncomeType = 'income' | 'no_income';

export interface IncomeSource {
  id: string;
  name: string;
  type: IncomeType;
  /** Income: monthly take-home. No-Income: monthly draw amount. */
  amount: string;
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export interface DebtItem {
  id: string;
  name: string;
  /** Monthly minimum payment */
  amount: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface CategoryItem {
  id: string;
  /** Matches a PresetCategory name — used to look up icon and color */
  name: string;
  /** Monthly spending limit */
  amount: string;
  /** Emoji icon from the preset list — stored so it renders without a lookup */
  icon: string;
  /** Hex color for dashboard charts and progress bars */
  color: string;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  /** Links to a CategoryItem.name in the user's budget */
  categoryName: string;
  /** Positive dollar amount spent */
  amount: number;
  /** ISO date string: "YYYY-MM-DD" */
  date: string;
  /** Optional memo — used later by the AI Advisor for context */
  note?: string;
}

// ─── Top-level budget document ────────────────────────────────────────────────

/**
 * The full shape of everything saved to / loaded from storage.
 * When we move to Supabase this becomes one row per user.
 */
export interface BudgetData {
  incomeSources: IncomeSource[];
  debts: DebtItem[];
  categories: CategoryItem[];
  transactions: Transaction[];
  /** ISO timestamp of the last *setup* save — shown on the Setup screen */
  lastSaved: string | null;
}
