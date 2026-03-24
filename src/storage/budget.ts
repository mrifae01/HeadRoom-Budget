/**
 * storage/budget.ts — AsyncStorage read/write helpers for budget data.
 *
 * All direct AsyncStorage calls are contained here.
 * The rest of the app talks to this module, never to AsyncStorage directly.
 * This makes it easy to swap in Supabase later — only this file changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BudgetData } from '../types/budget';

const STORAGE_KEY = '@headroom/budget';

/**
 * Persist the full budget document to local storage.
 * Stamps lastSaved with the current ISO timestamp before writing.
 * Used by the Setup screen "Save Budget" button.
 */
export async function saveBudget(data: Omit<BudgetData, 'lastSaved'>): Promise<void> {
  const payload: BudgetData = {
    ...data,
    lastSaved: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Write the full budget document as-is — no lastSaved stamp.
 * Used for auto-saving after each transaction so we don't pollute
 * the "Last saved" timestamp shown on the Setup screen.
 */
export async function writeRaw(data: BudgetData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Load the budget document from local storage.
 * Returns null if nothing has been saved yet.
 */
export async function loadBudget(): Promise<BudgetData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as BudgetData;
}

/**
 * Wipe all saved budget data.
 * Used for "reset app" / future logout flow.
 */
export async function clearBudget(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
