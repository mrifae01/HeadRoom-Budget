/**
 * SetupScreen — dynamic budget configuration.
 *
 * Reads initial data from BudgetContext (which loads from AsyncStorage on
 * startup) and writes back via saveBudget() when the user taps Save.
 *
 * Sections:
 *  1. Income Sources — Income (monthly amount) or No Income (savings draw)
 *  2. Debts          — name + monthly payment
 *  3. Categories     — name + monthly spending limit
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../theme';
import Card from '../components/Card';
import SectionHeader from '../components/SectionHeader';
import StyledInput from '../components/StyledInput';
import { useBudget } from '../context/BudgetContext';
import { IncomeSource, IncomeType, DebtItem, CategoryItem } from '../types/budget';
import { PRESET_CATEGORIES, PresetCategory } from '../data/categories';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Format an ISO timestamp into a readable "Last saved" string. */
function formatLastSaved(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Income type selector options ──────────────────────────────────────────────

const INCOME_TYPES: { key: IncomeType; label: string; icon: string }[] = [
  { key: 'income',    label: 'Income',    icon: '💼' },
  { key: 'no_income', label: 'No Income', icon: '🏦' },
];

// ─── IncomeCard ────────────────────────────────────────────────────────────────

interface IncomeCardProps {
  source: IncomeSource;
  onChange: (updated: IncomeSource) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function IncomeCard({ source, onChange, onRemove, canRemove }: IncomeCardProps) {
  const patch = (fields: Partial<IncomeSource>) => onChange({ ...source, ...fields });
  const isNoIncome = source.type === 'no_income';

  return (
    <View style={[icStyles.card, isNoIncome && icStyles.cardNoIncome]}>

      {/* ── Source name + remove ── */}
      <View style={icStyles.nameRow}>
        <View style={{ flex: 1 }}>
          <StyledInput
            placeholder={isNoIncome ? 'e.g. Savings account' : 'e.g. Day job, Freelance…'}
            value={source.name}
            onChangeText={(v) => patch({ name: v })}
            returnKeyType="next"
          />
        </View>
        {canRemove && (
          <TouchableOpacity
            style={icStyles.removeBtn}
            onPress={onRemove}
            accessibilityLabel="Remove income source"
          >
            <Text style={icStyles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Income / No Income pills ── */}
      <View style={icStyles.typeRow}>
        {INCOME_TYPES.map((opt) => {
          const active = source.type === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                icStyles.typePill,
                active && (opt.key === 'no_income'
                  ? icStyles.typePillWarningActive
                  : icStyles.typePillActive),
              ]}
              onPress={() => patch({ type: opt.key })}
              activeOpacity={0.75}
              accessibilityLabel={`Set income type to ${opt.label}`}
            >
              <Text style={icStyles.typePillIcon}>{opt.icon}</Text>
              <Text style={[
                icStyles.typePillLabel,
                active && (opt.key === 'no_income'
                  ? icStyles.typePillLabelWarning
                  : icStyles.typePillLabelActive),
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Regular income: monthly take-home ── */}
      {source.type === 'income' && (
        <StyledInput
          label="Monthly take-home"
          placeholder="0.00"
          prefix="$"
          keyboardType="decimal-pad"
          returnKeyType="done"
          value={source.amount}
          onChangeText={(v) => patch({ amount: v })}
        />
      )}

      {/* ── No Income: monthly draw from savings / reserves ── */}
      {source.type === 'no_income' && (
        <>
          <View style={icStyles.noIncomeNote}>
            <Text style={icStyles.noIncomeNoteText}>
              💡 No active income? Enter how much you plan to draw from savings or reserves each month to cover your budget.
            </Text>
          </View>
          <StyledInput
            label="Monthly draw amount"
            placeholder="0.00"
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={source.amount}
            onChangeText={(v) => patch({ amount: v })}
          />
        </>
      )}
    </View>
  );
}

// ─── DebtRow ───────────────────────────────────────────────────────────────────

interface DebtRowProps {
  item: DebtItem;
  onChange: (updated: DebtItem) => void;
  onRemove: () => void;
}

function DebtRow({ item, onChange, onRemove }: DebtRowProps) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.name}>
        <StyledInput
          placeholder="Debt name"
          value={item.name}
          onChangeText={(v) => onChange({ ...item, name: v })}
          returnKeyType="next"
        />
      </View>
      <View style={rowStyles.amount}>
        <StyledInput
          placeholder="0"
          value={item.amount}
          prefix="$"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onChangeText={(v) => onChange({ ...item, amount: v })}
        />
      </View>
      <TouchableOpacity
        style={rowStyles.removeBtn}
        onPress={onRemove}
        accessibilityLabel="Remove debt"
      >
        <Text style={rowStyles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── CategoryPickerModal ───────────────────────────────────────────────────────

interface CategoryPickerModalProps {
  visible: boolean;
  /** Names already in use by other rows — shown as disabled in the grid */
  usedNames: string[];
  onSelect: (preset: PresetCategory) => void;
  onClose: () => void;
}

/**
 * Full-screen modal showing a 2-column grid of preset categories.
 * Already-used categories are grayed out to prevent duplicates.
 */
function CategoryPickerModal({ visible, usedNames, onSelect, onClose }: CategoryPickerModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={pickerStyles.sheet}>
        {/* Header */}
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.headerTitle}>Choose a Category</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close picker">
            <Text style={pickerStyles.headerClose}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* 2-column grid */}
        <FlatList
          data={PRESET_CATEGORIES}
          keyExtractor={(item) => item.name}
          numColumns={2}
          contentContainerStyle={pickerStyles.grid}
          columnWrapperStyle={pickerStyles.gridRow}
          renderItem={({ item: preset }) => {
            const isUsed = usedNames.includes(preset.name);
            return (
              <TouchableOpacity
                style={[pickerStyles.cell, isUsed && pickerStyles.cellUsed]}
                onPress={() => !isUsed && onSelect(preset)}
                activeOpacity={isUsed ? 1 : 0.7}
                accessibilityLabel={`Select ${preset.name}`}
                accessibilityState={{ disabled: isUsed }}
              >
                {/* Color accent dot */}
                <View style={[pickerStyles.cellDot, { backgroundColor: preset.color }]} />
                <Text style={pickerStyles.cellIcon}>{preset.icon}</Text>
                <Text style={[pickerStyles.cellName, isUsed && pickerStyles.cellNameUsed]}>
                  {preset.name}
                </Text>
                {isUsed && <Text style={pickerStyles.cellUsedBadge}>Added</Text>}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── CategoryRow ───────────────────────────────────────────────────────────────

interface CategoryRowProps {
  item: CategoryItem;
  /** Names in use by *other* rows (not this one) — passed to the picker */
  usedNames: string[];
  onChange: (updated: CategoryItem) => void;
  onRemove: () => void;
}

function CategoryRow({ item, usedNames, onChange, onRemove }: CategoryRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (preset: PresetCategory) => {
    onChange({ ...item, name: preset.name, icon: preset.icon, color: preset.color });
    setPickerOpen(false);
  };

  return (
    <>
      <View style={rowStyles.row}>
        {/* Category selector button — replaces free-text input */}
        <TouchableOpacity
          style={[rowStyles.categoryBtn, !item.name && rowStyles.categoryBtnEmpty]}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.75}
          accessibilityLabel="Select category"
        >
          {item.name ? (
            <View style={rowStyles.categoryBtnInner}>
              {/* Color swatch */}
              <View style={[rowStyles.categoryDot, { backgroundColor: item.color }]} />
              <Text style={rowStyles.categoryIcon}>{item.icon}</Text>
              <Text style={rowStyles.categoryName} numberOfLines={1}>{item.name}</Text>
            </View>
          ) : (
            <Text style={rowStyles.categoryPlaceholder}>Select category…</Text>
          )}
          <Text style={rowStyles.categoryChevron}>›</Text>
        </TouchableOpacity>

        {/* Monthly limit input */}
        <View style={rowStyles.amount}>
          <StyledInput
            placeholder="0"
            value={item.amount}
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            onChangeText={(v) => onChange({ ...item, amount: v })}
          />
        </View>

        <TouchableOpacity
          style={rowStyles.removeBtn}
          onPress={onRemove}
          accessibilityLabel="Remove category"
        >
          <Text style={rowStyles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <CategoryPickerModal
        visible={pickerOpen}
        usedNames={usedNames}
        onSelect={handleSelect}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

// ─── AddButton ─────────────────────────────────────────────────────────────────

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.addButton} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.addButtonText}>+ {label}</Text>
    </TouchableOpacity>
  );
}

// ─── SetupScreen ───────────────────────────────────────────────────────────────

/** Possible states for the Save button */
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SetupScreen() {
  // ── Pull data + actions from context ────────────────────────────────────────
  const { budget, isLoading, saveBudget } = useBudget();

  // ── Local form state (mirrors context, edited in-place before saving) ───────
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>(budget.incomeSources);
  const [debts,         setDebts]         = useState<DebtItem[]>(budget.debts);
  const [categories,    setCategories]    = useState<CategoryItem[]>(budget.categories);
  const [saveState,     setSaveState]     = useState<SaveState>('idle');

  /**
   * Once the async load from AsyncStorage completes, sync the form
   * with whatever was actually saved. Runs exactly once.
   */
  useEffect(() => {
    if (!isLoading) {
      setIncomeSources(budget.incomeSources);
      setDebts(budget.debts);
      setCategories(budget.categories);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // ── Income handlers ──────────────────────────────────────────────────────────

  const updateIncome = useCallback((id: string, updated: IncomeSource) =>
    setIncomeSources((prev) => prev.map((s) => (s.id === id ? updated : s))), []);

  const removeIncome = useCallback((id: string) =>
    setIncomeSources((prev) => prev.filter((s) => s.id !== id)), []);

  const addIncome = useCallback(() =>
    setIncomeSources((prev) => [
      ...prev,
      { id: uid(), name: '', type: 'income', amount: '' },
    ]), []);

  // ── Debt handlers ────────────────────────────────────────────────────────────

  const updateDebt = useCallback((id: string, updated: DebtItem) =>
    setDebts((prev) => prev.map((d) => (d.id === id ? updated : d))), []);

  const removeDebt = useCallback((id: string) =>
    setDebts((prev) => prev.filter((d) => d.id !== id)), []);

  const addDebt = useCallback(() =>
    setDebts((prev) => [...prev, { id: uid(), name: '', amount: '' }]), []);

  // ── Category handlers ────────────────────────────────────────────────────────

  const updateCategory = useCallback((id: string, updated: CategoryItem) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c))), []);

  const removeCategory = useCallback((id: string) =>
    setCategories((prev) => prev.filter((c) => c.id !== id)), []);

  const addCategory = useCallback(() =>
    setCategories((prev) => [...prev, { id: uid(), name: '', amount: '', icon: '', color: '' }]), []);

  // ── Save handler ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      await saveBudget({ incomeSources, debts, categories });
      setSaveState('saved');
      // Return button to idle after 2 s
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      console.error('[SetupScreen] Save failed:', err);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [saveBudget, incomeSources, debts, categories]);

  // ── Save button label / style ─────────────────────────────────────────────────

  const saveButtonLabel =
    saveState === 'saving' ? 'Saving…'         :
    saveState === 'saved'  ? '✓ Saved!'         :
    saveState === 'error'  ? 'Save failed — retry' :
    'Save Budget';

  const saveButtonStyle = [
    styles.saveButton,
    saveState === 'saved' && styles.saveButtonSuccess,
    saveState === 'error' && styles.saveButtonError,
  ];

  // ── Loading overlay while AsyncStorage read is in progress ───────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your budget…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      {/*
        KeyboardAvoidingView sits between SafeAreaView and the ScrollView.
        On iOS 'padding' adds bottom padding equal to the keyboard height so
        the scroll area shrinks and the focused input is never hidden.
        On Android the OS already resizes the window (adjustResize), so we
        pass undefined and let the system handle it.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >

        {/* ── Page header ── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Budget Setup</Text>
          <Text style={styles.pageSubtitle}>
            Configure your income sources, debts, and spending categories.
          </Text>
        </View>

        {/* ── Section 1: Income Sources ── */}
        <Card style={styles.section}>
          <SectionHeader
            title="Income Sources"
            subtitle="Add every source of monthly income"
            accentColor={colors.accent}
          />
          {incomeSources.map((source) => (
            <IncomeCard
              key={source.id}
              source={source}
              onChange={(updated) => updateIncome(source.id, updated)}
              onRemove={() => removeIncome(source.id)}
              canRemove={incomeSources.length > 1}
            />
          ))}
          <AddButton label="Add Income Source" onPress={addIncome} />
        </Card>

        {/* ── Section 2: Debts ── */}
        <Card style={styles.section}>
          <SectionHeader
            title="Debts"
            subtitle="Monthly minimum payments"
            accentColor={colors.danger}
          />
          {debts.map((d) => (
            <DebtRow
              key={d.id}
              item={d}
              onChange={(updated) => updateDebt(d.id, updated)}
              onRemove={() => removeDebt(d.id)}
            />
          ))}
          <AddButton label="Add Debt" onPress={addDebt} />
        </Card>

        {/* ── Section 3: Budget Categories ── */}
        <Card style={styles.section}>
          <SectionHeader
            title="Budget Categories"
            subtitle="Set a monthly limit for each category"
            accentColor={colors.primary}
          />
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              item={c}
              // Pass names from every OTHER row so the picker grays them out
              usedNames={categories.filter((x) => x.id !== c.id).map((x) => x.name)}
              onChange={(updated) => updateCategory(c.id, updated)}
              onRemove={() => removeCategory(c.id)}
            />
          ))}
          <AddButton label="Add Category" onPress={addCategory} />
        </Card>

        {/* ── Save button ── */}
        <TouchableOpacity
          style={saveButtonStyle}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={saveState === 'saving'}
          accessibilityLabel="Save budget"
        >
          {saveState === 'saving' ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.saveButtonText}>{saveButtonLabel}</Text>
          )}
        </TouchableOpacity>

        {/* ── Last saved timestamp ── */}
        {budget.lastSaved && (
          <Text style={styles.lastSaved}>
            Last saved {formatLastSaved(budget.lastSaved)}
          </Text>
        )}

        <View style={{ height: spacing[8] }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
  },
  pageHeader: {
    marginBottom: spacing[5],
  },
  pageTitle: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: spacing[1],
    lineHeight: typography.sm * typography.relaxed,
  },
  section: {
    marginBottom: spacing[4],
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    marginTop: spacing[1],
  },
  addButtonText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.primary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[2],
    ...shadows.md,
  },
  saveButtonSuccess: {
    backgroundColor: colors.accent,
  },
  saveButtonError: {
    backgroundColor: colors.danger,
  },
  saveButtonText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
  lastSaved: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing[2],
  },
});

const icStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  cardNoIncome: {
    borderColor: colors.warning,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  removeBtn: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textMuted,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  typePill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 2,
  },
  typePillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  typePillWarningActive: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
  },
  typePillIcon: {
    fontSize: 18,
  },
  typePillLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
  },
  typePillLabelActive: {
    color: colors.primary,
  },
  typePillLabelWarning: {
    color: colors.warning,
  },
  noIncomeNote: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.sm,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  noIncomeNoteText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    lineHeight: typography.sm * typography.relaxed,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  // ── Category selector button (replaces free-text input) ──
  categoryBtn: {
    flex: 1.4,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
  },
  categoryBtnEmpty: {
    borderStyle: 'dashed',
  },
  categoryBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryName: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textPrimary,
  },
  categoryPlaceholder: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  categoryChevron: {
    fontSize: 20,
    color: colors.textMuted,
    lineHeight: 22,
  },
  // ── Debt row name input (free-text, unlike category selector) ──
  name: {
    flex: 1.4,
  },
  // ── Amount + remove (shared with DebtRow) ──
  amount: {
    flex: 1,
  },
  removeBtn: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textMuted,
  },
});

// ─── Category picker modal styles ──────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerClose: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.primary,
  },
  grid: {
    padding: spacing[4],
    gap: spacing[3],
  },
  gridRow: {
    gap: spacing[3],
  },
  cell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing[4],
    alignItems: 'center',
    gap: spacing[1],
    ...shadows.sm,
  },
  cellUsed: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    opacity: 0.5,
  },
  cellDot: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cellIcon: {
    fontSize: 32,
    marginBottom: spacing[1],
  },
  cellName: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cellNameUsed: {
    color: colors.textMuted,
  },
  cellUsedBadge: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
});
