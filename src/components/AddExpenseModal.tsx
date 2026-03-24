/**
 * AddExpenseModal — slide-up sheet for logging OR editing an expense.
 *
 * Add mode  (editingTransaction = undefined):
 *   - Empty form, "Add" button, transaction is appended.
 *
 * Edit mode (editingTransaction = existing Transaction):
 *   - Form pre-filled, "Save" button, transaction is updated in-place.
 *
 * The content is wrapped in a ScrollView so the amount / note fields
 * are always scrollable above the keyboard on every platform.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { useBudget } from '../context/BudgetContext';
import { CategoryItem, Transaction } from '../types/budget';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Other/Misc catch-all ─────────────────────────────────────────────────────

const OTHER_CATEGORY: CategoryItem = {
  id: '__other__',
  name: 'Other/Misc',
  icon: '📦',
  color: '#94A3B8',
  amount: '0',
};

// ─── CategoryRow (picker list item) ──────────────────────────────────────────

interface CategoryRowProps {
  item: CategoryItem;
  selected: boolean;
  onPress: () => void;
}

function CategoryRow({ item, selected, onPress }: CategoryRowProps) {
  return (
    <TouchableOpacity
      style={[styles.catRow, selected && styles.catRowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`Select ${item.name}`}
      accessibilityState={{ selected }}
    >
      <View style={[styles.catDot, { backgroundColor: item.color }]} />
      <Text style={styles.catIcon}>{item.icon}</Text>
      <Text style={[styles.catName, selected && styles.catNameSelected]}>
        {item.name}
      </Text>
      {selected && <Text style={[styles.catCheck, { color: item.color }]}>✓</Text>}
    </TouchableOpacity>
  );
}

// ─── AddExpenseModal ──────────────────────────────────────────────────────────

export interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  /** When provided the modal opens in edit mode pre-filled with this transaction */
  editingTransaction?: Transaction | null;
}

export default function AddExpenseModal({
  visible,
  onClose,
  editingTransaction,
}: AddExpenseModalProps) {
  const { budget, addTransaction, editTransaction } = useBudget();

  const isEditing = !!editingTransaction;

  // ── Form state ───────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [amount,  setAmount]  = useState('');
  const [note,    setNote]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Category list — Other/Misc always at the bottom ──────────────────────────
  const displayCategories = useMemo(() => {
    const alreadyHasOther = budget.categories.some(
      (c) => c.name === OTHER_CATEGORY.name,
    );
    return alreadyHasOther
      ? budget.categories
      : [...budget.categories, OTHER_CATEGORY];
  }, [budget.categories]);

  // ── Pre-fill form when opening in edit mode ──────────────────────────────────
  useEffect(() => {
    if (visible && editingTransaction) {
      const cat =
        displayCategories.find((c) => c.name === editingTransaction.categoryName)
        ?? null;
      setSelectedCategory(cat);
      setAmount(editingTransaction.amount.toString());
      setNote(editingTransaction.note ?? '');
      setError(null);
      setSaving(false);
    } else if (visible && !editingTransaction) {
      // Add mode — start blank
      setSelectedCategory(null);
      setAmount('');
      setNote('');
      setError(null);
      setSaving(false);
    }
  }, [visible, editingTransaction]);

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!selectedCategory) return 'Please select a category.';
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return 'Please enter a valid amount greater than $0.';
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        categoryName: selectedCategory!.name,
        amount: parseFloat(amount),
        date: isEditing ? editingTransaction!.date : todayISO(),
        note: note.trim() || undefined,
      };

      if (isEditing) {
        await editTransaction(editingTransaction!.id, payload);
      } else {
        await addTransaction(payload);
      }
      onClose();
    } catch (e) {
      console.error('[AddExpenseModal] Submit failed:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [selectedCategory, amount, note, isEditing, editingTransaction,
      addTransaction, editTransaction, onClose]);

  const isReady = !!selectedCategory && parseFloat(amount) > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/*
        KeyboardAvoidingView + ScrollView combination:
        - KAV shrinks/pads the sheet when keyboard appears
        - ScrollView lets the user scroll to the amount/note fields
          even if the category list is long
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <SafeAreaView style={styles.sheet}>

          {/* ── Fixed header ── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Cancel">
              <Text style={styles.headerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {isEditing ? 'Edit Expense' : 'Log Expense'}
            </Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!isReady || saving}
              accessibilityLabel={isEditing ? 'Save changes' : 'Log expense'}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.headerAction, !isReady && styles.headerActionDisabled]}>
                  {isEditing ? 'Save' : 'Add'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Error banner ── */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* ── Scrollable body — scrolls under the keyboard ── */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
          >
            {/* Category section */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CATEGORY</Text>
              <FlatList
                data={displayCategories}
                keyExtractor={(c) => c.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <CategoryRow
                    item={item}
                    selected={selectedCategory?.id === item.id}
                    onPress={() => { setSelectedCategory(item); setError(null); }}
                  />
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            </View>

            {/* Amount section */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>AMOUNT</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountPrefix}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  value={amount}
                  onChangeText={(v) => { setAmount(v); setError(null); }}
                />
              </View>
            </View>

            {/* Note section */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                NOTE <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. Weekly grocery run, Netflix subscription…"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                value={note}
                onChangeText={setNote}
                maxLength={120}
              />
            </View>

            {/* Bottom breathing room */}
            <View style={{ height: spacing[8] }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCancel: {
    fontSize: typography.base,
    color: colors.textSecondary,
    fontWeight: typography.medium,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerAction: {
    fontSize: typography.base,
    color: colors.primary,
    fontWeight: typography.bold,
    minWidth: 60,
    textAlign: 'right',
  },
  headerActionDisabled: {
    color: colors.textMuted,
  },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.danger,
  },
  errorText: {
    fontSize: typography.sm,
    color: colors.danger,
    fontWeight: typography.medium,
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  optional: {
    fontWeight: typography.regular,
    textTransform: 'none',
    letterSpacing: 0,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing[4] + 8 + 20 + spacing[2],
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  catRowSelected: {
    backgroundColor: colors.primaryLight,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catIcon: {
    fontSize: 20,
  },
  catName: {
    flex: 1,
    fontSize: typography.base,
    color: colors.textPrimary,
    fontWeight: typography.medium,
  },
  catNameSelected: {
    fontWeight: typography.semibold,
  },
  catCheck: {
    fontSize: typography.base,
    fontWeight: typography.bold,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  amountPrefix: {
    fontSize: typography.xl,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  amountInput: {
    flex: 1,
    fontSize: typography.xl,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    paddingVertical: spacing[2],
  },
  noteInput: {
    fontSize: typography.base,
    color: colors.textPrimary,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    minHeight: 44,
  },
});
