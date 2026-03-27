/**
 * storage/budget.ts — Supabase helpers for budget setup and live transactions.
 *
 * Budget setup (income, debts, categories) → `budgets` table (one row per user)
 * Live transactions                        → `transactions` table (one row each)
 *
 * Transactions are stored as individual rows so add/edit/delete are simple
 * single-row operations.  They are deleted from this table when a month is
 * archived and moved into `monthly_records`.
 */

import { supabase } from '../config/supabase';
import { BudgetData, Transaction, SavingsGoal } from '../types/budget';

// ─── Budget setup ─────────────────────────────────────────────────────────────

/**
 * Upsert budget setup for a user, stamping lastSaved.
 * Called by the Setup screen "Save Budget" button.
 */
export async function saveBudget(
  data: Omit<BudgetData, 'lastSaved' | 'transactions'>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .upsert({
      user_id:                    userId,
      income_sources:             data.incomeSources,
      debts:                      data.debts,
      categories:                 data.categories,
      last_saved:                 new Date().toISOString(),
      last_archived_month:        data.lastArchivedMonth,
      savings_goals:              data.savingsGoals,
      savings_pool:               data.savingsPool,
      last_surplus_prompt_period: data.lastSurplusPromptPeriod,
    }, { onConflict: 'user_id' });

  if (error) throw error;
}

/**
 * Upsert budget setup without stamping lastSaved.
 * Used for silent background saves (AI adjustments, debt balance updates, etc.)
 */
export async function writeRaw(
  data: Omit<BudgetData, 'transactions'>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .upsert({
      user_id:                    userId,
      income_sources:             data.incomeSources,
      debts:                      data.debts,
      categories:                 data.categories,
      last_saved:                 data.lastSaved,
      last_archived_month:        data.lastArchivedMonth,
      savings_goals:              data.savingsGoals,
      savings_pool:               data.savingsPool,
      last_surplus_prompt_period: data.lastSurplusPromptPeriod,
    }, { onConflict: 'user_id' });

  if (error) throw error;
}

/**
 * Load budget setup for a user (no transactions — loaded separately).
 * Returns null if the user has not yet saved their budget (first launch).
 */
export async function loadBudget(
  userId: string,
): Promise<Omit<BudgetData, 'transactions'> | null> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row yet — first launch
    throw error;
  }

  return {
    incomeSources:            data.income_sources               ?? [],
    debts:                    data.debts                        ?? [],
    categories:               data.categories                   ?? [],
    lastSaved:                data.last_saved                   ?? null,
    lastArchivedMonth:        data.last_archived_month          ?? null,
    savingsGoals:             (data.savings_goals as SavingsGoal[]) ?? [],
    savingsPool:              (data.savings_pool as number)     ?? 0,
    lastSurplusPromptPeriod:  data.last_surplus_prompt_period   ?? null,
  };
}

// ─── Transactions ─────────────────────────────────────────────────────────────

/** Load all live (non-archived) transactions for a user, newest first. */
export async function loadTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id:           row.id,
    categoryName: row.category_name,
    amount:       Number(row.amount),
    date:         row.date,
    note:         row.note ?? undefined,
  }));
}

/** Insert a new transaction row. */
export async function insertTransaction(tx: Transaction, userId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .insert({
      id:            tx.id,
      user_id:       userId,
      category_name: tx.categoryName,
      amount:        tx.amount,
      date:          tx.date,
      note:          tx.note ?? null,
    });

  if (error) throw error;
}

/** Update an existing transaction row by id. */
export async function updateTransaction(tx: Transaction, userId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      category_name: tx.categoryName,
      amount:        tx.amount,
      date:          tx.date,
      note:          tx.note ?? null,
    })
    .eq('id', tx.id)
    .eq('user_id', userId);

  if (error) throw error;
}

/** Delete a single transaction by id. */
export async function deleteTransactionById(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Delete all transactions dated before the first day of `currentMonth`.
 * Called during month-end archiving after past transactions have been saved
 * into `monthly_records`.
 */
export async function deleteTransactionsBefore(
  currentMonth: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .lt('date', `${currentMonth}-01`);

  if (error) throw error;
}
