/**
 * GoalsScreen — Savings goals and "Potential Savings" pool.
 *
 * Features:
 *  - "Potential Savings" pool card (unallocated bi-weekly surplus)
 *  - List of savings goals / "saving for" wants with progress bars
 *  - Add goal modal
 *  - Allocate-from-pool modal (manual split + "Save All" shortcut)
 *  - Bi-weekly period-end prompt (auto-surfaces when biweeklyEndPending is true)
 *  - Celebration modal when a goal is completed
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBudget } from '../context/BudgetContext';
import { useTheme } from '../context/ThemeContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { typography, spacing, radius, shadows } from '../theme';
import { SavingsGoal } from '../types/budget';

// ─── Emoji picker options ──────────────────────────────────────────────────────

const GOAL_EMOJIS = [
  '🌴', '✈️', '🏖️', '🏔️', '🚗', '🏠', '💻', '📱', '🎮', '👟',
  '💍', '🎓', '👶', '🐶', '🏋️', '🎸', '📷', '⌚', '🛋️', '💰',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function progressPct(goal: SavingsGoal): number {
  if (!goal.targetAmount || goal.targetAmount <= 0) return 0;
  return Math.min(1, goal.currentAmount / goal.targetAmount);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ height: 6, width: `${Math.round(pct * 100)}%`, borderRadius: radius.full, backgroundColor: color }} />
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { colors } = useTheme();
  const insets     = useSafeAreaInsets();
  const isDesktop  = useIsDesktop();
  const {
    budget,
    biweeklyEndPending,
    pendingSurplus,
    addGoal,
    deleteGoal,
    contributeToGoal,
    claimSurplusToPool,
    dismissBiweeklyPrompt,
  } = useBudget();

  const { savingsGoals, savingsPool } = budget;

  // ── Modal visibility ────────────────────────────────────────────────────────
  const [showAddModal,        setShowAddModal]        = useState(false);
  const [showAllocateModal,   setShowAllocateModal]   = useState(false);
  const [showPeriodEndModal,  setShowPeriodEndModal]  = useState(false);
  const [showCelebration,     setShowCelebration]     = useState(false);
  const [celebratedGoal,      setCelebratedGoal]      = useState<SavingsGoal | null>(null);

  // ── Add goal form ───────────────────────────────────────────────────────────
  const [newName,         setNewName]         = useState('');
  const [newIcon,         setNewIcon]         = useState('💰');
  const [newTarget,       setNewTarget]       = useState('');
  const [newType,         setNewType]         = useState<'goal' | 'want'>('goal');

  // ── Allocation state (pool → goals) ────────────────────────────────────────
  const [allocAmounts, setAllocAmount] = useState<Record<string, string>>({});

  // ── Period-end modal state ──────────────────────────────────────────────────
  const [periodAllocAmounts, setPeriodAllocAmount] = useState<Record<string, string>>({});

  // Show period-end modal automatically when context flags it
  useEffect(() => {
    if (biweeklyEndPending) setShowPeriodEndModal(true);
  }, [biweeklyEndPending]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddGoal = useCallback(async () => {
    const name   = newName.trim();
    const target = parseFloat(newTarget) || 0;
    if (!name) {
      if (Platform.OS === 'web') { window.alert('Please give your goal a name.'); }
      else { Alert.alert('Name required', 'Please give your goal a name.'); }
      return;
    }

    await addGoal({ name, icon: newIcon, targetAmount: target, type: newType });
    setNewName('');
    setNewTarget('');
    setNewIcon('💰');
    setNewType('goal');
    setShowAddModal(false);
  }, [newName, newIcon, newTarget, newType, addGoal]);

  const handleDeleteGoal = useCallback((goal: SavingsGoal) => {
    const confirmMsg = goal.currentAmount > 0
      ? `Delete "${goal.name}"? ${fmt(goal.currentAmount)} will be returned to Potential Savings.`
      : `Delete "${goal.name}"? This cannot be undone.`;

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) deleteGoal(goal.id);
    } else {
      Alert.alert(
        `Delete "${goal.name}"?`,
        goal.currentAmount > 0
          ? `${fmt(goal.currentAmount)} will be returned to Potential Savings.`
          : 'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(goal.id) },
        ],
      );
    }
  }, [deleteGoal]);

  const handleContribute = useCallback(async (goalId: string, amountStr: string) => {
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) {
      if (Platform.OS === 'web') { window.alert('Enter a positive dollar amount.'); }
      else { Alert.alert('Invalid amount', 'Enter a positive dollar amount.'); }
      return;
    }
    if (amount > savingsPool) {
      if (Platform.OS === 'web') { window.alert(`Your Potential Savings balance is ${fmt(savingsPool)}.`); }
      else { Alert.alert('Not enough', `Your Potential Savings balance is ${fmt(savingsPool)}.`); }
      return;
    }

    const updated = await contributeToGoal(goalId, amount);
    setAllocAmount((prev) => ({ ...prev, [goalId]: '' }));

    if (updated?.completedAt) {
      setCelebratedGoal(updated);
      setShowCelebration(true);
      setShowAllocateModal(false);
    }
  }, [savingsPool, contributeToGoal]);

  const handleSaveAllToGoal = useCallback(async (goalId: string) => {
    if (savingsPool <= 0) return;
    const updated = await contributeToGoal(goalId, savingsPool);
    setShowAllocateModal(false);
    if (updated?.completedAt) {
      setCelebratedGoal(updated);
      setShowCelebration(true);
    }
  }, [savingsPool, contributeToGoal]);

  // Period-end: claim surplus to pool (optionally with direct allocation to goals)
  const handlePeriodEndConfirm = useCallback(async () => {
    // First add the full surplus to the pool
    await claimSurplusToPool(pendingSurplus);

    // Then apply any direct allocations the user typed
    for (const [goalId, amtStr] of Object.entries(periodAllocAmounts)) {
      const amount = parseFloat(amtStr);
      if (amount > 0) await contributeToGoal(goalId, amount);
    }

    setPeriodAllocAmount({});
    setShowPeriodEndModal(false);
  }, [pendingSurplus, periodAllocAmounts, claimSurplusToPool, contributeToGoal]);

  const handlePeriodEndDismiss = useCallback(async () => {
    await dismissBiweeklyPrompt();
    setPeriodAllocAmount({});
    setShowPeriodEndModal(false);
  }, [dismissBiweeklyPrompt]);

  // Period-end: "save all" to a single goal
  const handlePeriodSaveAll = useCallback(async (goalId: string) => {
    await claimSurplusToPool(pendingSurplus);
    const updated = await contributeToGoal(goalId, pendingSurplus);
    setPeriodAllocAmount({});
    setShowPeriodEndModal(false);
    if (updated?.completedAt) {
      setCelebratedGoal(updated);
      setShowCelebration(true);
    }
  }, [pendingSurplus, claimSurplusToPool, contributeToGoal]);

  // ── Styles (inline, theme-aware) ────────────────────────────────────────────
  const s = makeStyles(colors, isDesktop);

  // ── Render ──────────────────────────────────────────────────────────────────

  const activeGoals    = savingsGoals.filter((g) => !g.completedAt);
  const completedGoals = savingsGoals.filter((g) => !!g.completedAt);

  const totalSaved = savingsGoals.reduce((s, g) => s + g.currentAmount, 0);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Goals</Text>
          <Text style={s.headerSub}>Track your savings progress</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={s.addBtnText}>+ New Goal</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Potential Savings pool card ── */}
        <View style={[s.poolCard, shadows.md]}>
          <View style={s.poolRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.poolLabel}>Potential Savings</Text>
              <Text style={s.poolBalance}>{fmt(savingsPool)}</Text>
              <Text style={s.poolSub}>Unallocated surplus — ready to allocate</Text>
            </View>
            <Text style={{ fontSize: 40 }}>🏦</Text>
          </View>
          {/* Stats row */}
          <View style={s.poolStats}>
            <View style={s.poolStat}>
              <Text style={s.poolStatValue}>{savingsGoals.length}</Text>
              <Text style={s.poolStatLabel}>Goals</Text>
            </View>
            <View style={[s.poolStatDivider]} />
            <View style={s.poolStat}>
              <Text style={s.poolStatValue}>{fmt(totalSaved)}</Text>
              <Text style={s.poolStatLabel}>Total Saved</Text>
            </View>
            <View style={[s.poolStatDivider]} />
            <View style={s.poolStat}>
              <Text style={s.poolStatValue}>{activeGoals.length}</Text>
              <Text style={s.poolStatLabel}>Active</Text>
            </View>
          </View>
          {savingsPool > 0 && (
            <TouchableOpacity style={s.allocateBtn} onPress={() => setShowAllocateModal(true)}>
              <Text style={s.allocateBtnText}>Allocate to Goals →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Active goals ── */}
        {activeGoals.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Active Goals</Text>
            <View style={[s.goalGrid, isDesktop && s.goalGridDesktop]}>
              {activeGoals.map((goal) => (
                <View key={goal.id} style={[s.goalGridItem, isDesktop && s.goalGridItemDesktop]}>
                  <GoalCard goal={goal} colors={colors} onDelete={() => handleDeleteGoal(goal)} />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Completed goals ── */}
        {completedGoals.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Completed</Text>
            <View style={[s.goalGrid, isDesktop && s.goalGridDesktop]}>
              {completedGoals.map((goal) => (
                <View key={goal.id} style={[s.goalGridItem, isDesktop && s.goalGridItemDesktop]}>
                  <GoalCard goal={goal} colors={colors} onDelete={() => handleDeleteGoal(goal)} completed />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Empty state ── */}
        {savingsGoals.length === 0 && (
          <View style={s.empty}>
            <Text style={{ fontSize: 52, marginBottom: spacing[3] }}>🎯</Text>
            <Text style={s.emptyTitle}>No goals yet</Text>
            <Text style={s.emptySub}>
              Create a savings goal with a target amount, or a "saving for" want to stash surplus whenever you have it.
            </Text>
            <TouchableOpacity style={[s.addBtn, { marginTop: spacing[4] }]} onPress={() => setShowAddModal(true)}>
              <Text style={s.addBtnText}>+ Create your first goal</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: spacing[10] }} />
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════════════
          ADD GOAL MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={[s.modalRoot, { paddingBottom: insets.bottom + spacing[4] }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Goal</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={[s.modalCancel, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Type toggle */}
              <Text style={s.fieldLabel}>Type</Text>
              <View style={s.typeRow}>
                {(['goal', 'want'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typePill, newType === t && { backgroundColor: colors.primary }]}
                    onPress={() => setNewType(t)}
                  >
                    <Text style={[s.typePillText, newType === t && { color: '#fff' }]}>
                      {t === 'goal' ? '🎯 Savings Goal' : '✨ Saving For'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.typeHint}>
                {newType === 'goal'
                  ? 'Structured goal with a target amount (e.g. Emergency Fund).'
                  : 'Discretionary want — you decide how much surplus to put in.'}
              </Text>

              {/* Emoji */}
              <Text style={s.fieldLabel}>Icon</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing[4] }}>
                {GOAL_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[s.emojiBtn, newIcon === e && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                    onPress={() => setNewIcon(e)}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Name */}
              <Text style={s.fieldLabel}>Name</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                placeholder={newType === 'goal' ? 'e.g. Emergency Fund' : 'e.g. Bali Trip'}
                placeholderTextColor={colors.textMuted}
                value={newName}
                onChangeText={setNewName}
              />

              {/* Target amount */}
              <Text style={s.fieldLabel}>Target Amount {newType === 'want' ? '(optional)' : ''}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                placeholder="$0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={newTarget}
                onChangeText={setNewTarget}
              />

              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleAddGoal}>
                <Text style={s.primaryBtnText}>Create Goal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          ALLOCATE MODAL (pool → goals)
      ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showAllocateModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={[s.modalRoot, { paddingBottom: insets.bottom + spacing[4] }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Allocate Savings</Text>
              <TouchableOpacity onPress={() => setShowAllocateModal(false)}>
                <Text style={[s.modalCancel, { color: colors.textMuted }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={s.poolMini}>
              <Text style={[s.poolLabel, { color: colors.textSecondary }]}>Available</Text>
              <Text style={[s.poolBalance, { fontSize: typography['2xl'] }]}>{fmt(savingsPool)}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {activeGoals.length === 0 && (
                <Text style={[s.emptySub, { textAlign: 'center', marginTop: spacing[8] }]}>
                  No active goals. Create one first.
                </Text>
              )}
              {activeGoals.map((goal) => {
                const pct = progressPct(goal);
                return (
                  <View key={goal.id} style={[s.allocGoalCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <View style={s.allocGoalTop}>
                      <Text style={{ fontSize: 28 }}>{goal.icon}</Text>
                      <View style={{ flex: 1, marginLeft: spacing[3] }}>
                        <Text style={[s.goalName, { color: colors.textPrimary }]}>{goal.name}</Text>
                        {goal.targetAmount > 0 && (
                          <Text style={[s.goalProgress, { color: colors.textMuted }]}>
                            {fmt(goal.currentAmount)} / {fmt(goal.targetAmount)}
                          </Text>
                        )}
                        {goal.targetAmount > 0 && (
                          <View style={{ marginTop: spacing[1] }}>
                            <ProgressBar pct={pct} color={colors.accent} />
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={s.allocInputRow}>
                      <TextInput
                        style={[s.allocInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                        placeholder="$0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={allocAmounts[goal.id] ?? ''}
                        onChangeText={(v) => setAllocAmount((prev) => ({ ...prev, [goal.id]: v }))}
                      />
                      <TouchableOpacity
                        style={[s.contributeBtn, { backgroundColor: colors.accent }]}
                        onPress={() => handleContribute(goal.id, allocAmounts[goal.id] ?? '')}
                      >
                        <Text style={s.contributeBtnText}>Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.saveAllBtn, { borderColor: colors.accent }]}
                        onPress={() => handleSaveAllToGoal(goal.id)}
                      >
                        <Text style={[s.saveAllBtnText, { color: colors.accent }]}>Save All</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: spacing[8] }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          BI-WEEKLY PERIOD END MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showPeriodEndModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={[s.modalRoot, { paddingBottom: insets.bottom + spacing[4] }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Period Recap 🎉</Text>
            </View>

            <View style={[s.surplusBanner, { backgroundColor: colors.accentLight }]}>
              <Text style={[s.surplusLabel, { color: colors.accentDark }]}>You finished the period with</Text>
              <Text style={[s.surplusAmount, { color: colors.accentDark }]}>{fmt(pendingSurplus)} surplus</Text>
              <Text style={[s.surplusSub, { color: colors.accentDark }]}>
                Allocate some to your goals, or keep it all in Potential Savings.
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {activeGoals.length === 0 && (
                <Text style={[s.emptySub, { textAlign: 'center', marginTop: spacing[6] }]}>
                  No active goals yet — your surplus will go to Potential Savings.
                </Text>
              )}
              {activeGoals.map((goal) => {
                const pct = progressPct(goal);
                return (
                  <View key={goal.id} style={[s.allocGoalCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <View style={s.allocGoalTop}>
                      <Text style={{ fontSize: 28 }}>{goal.icon}</Text>
                      <View style={{ flex: 1, marginLeft: spacing[3] }}>
                        <Text style={[s.goalName, { color: colors.textPrimary }]}>{goal.name}</Text>
                        {goal.targetAmount > 0 && (
                          <Text style={[s.goalProgress, { color: colors.textMuted }]}>
                            {fmt(goal.currentAmount)} / {fmt(goal.targetAmount)}
                          </Text>
                        )}
                        {goal.targetAmount > 0 && (
                          <View style={{ marginTop: spacing[1] }}>
                            <ProgressBar pct={pct} color={colors.accent} />
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={s.allocInputRow}>
                      <TextInput
                        style={[s.allocInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                        placeholder="$0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={periodAllocAmounts[goal.id] ?? ''}
                        onChangeText={(v) => setPeriodAllocAmount((prev) => ({ ...prev, [goal.id]: v }))}
                      />
                      <TouchableOpacity
                        style={[s.saveAllBtn, { borderColor: colors.primary }]}
                        onPress={() => handlePeriodSaveAll(goal.id)}
                      >
                        <Text style={[s.saveAllBtnText, { color: colors.primary }]}>Save All</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.accent, marginTop: spacing[4] }]}
                onPress={handlePeriodEndConfirm}
              >
                <Text style={s.primaryBtnText}>
                  {Object.values(periodAllocAmounts).some((v) => parseFloat(v) > 0)
                    ? 'Allocate & Save Rest to Pool'
                    : 'Save All to Potential Savings'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.skipBtn} onPress={handlePeriodEndDismiss}>
                <Text style={[s.skipBtnText, { color: colors.textMuted }]}>Skip for now</Text>
              </TouchableOpacity>

              <View style={{ height: spacing[8] }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          CELEBRATION MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showCelebration} animationType="fade" transparent>
        <Pressable style={s.celebOverlay} onPress={() => setShowCelebration(false)}>
          <View style={[s.celebCard, { backgroundColor: colors.surface }, shadows.lg]}>
            <Text style={{ fontSize: 64, marginBottom: spacing[3] }}>
              {celebratedGoal?.icon ?? '🎉'}
            </Text>
            <Text style={[s.celebTitle, { color: colors.textPrimary }]}>Goal Reached!</Text>
            <Text style={[s.celebName, { color: colors.primary }]}>{celebratedGoal?.name}</Text>
            {celebratedGoal?.targetAmount ? (
              <Text style={[s.celebAmount, { color: colors.textSecondary }]}>
                {fmt(celebratedGoal.targetAmount)} saved
              </Text>
            ) : null}
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: colors.primary, marginTop: spacing[5] }]}
              onPress={() => setShowCelebration(false)}
            >
              <Text style={s.primaryBtnText}>Woohoo! 🙌</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  colors,
  onDelete,
  completed = false,
}: {
  goal: SavingsGoal;
  colors: ReturnType<typeof useTheme>['colors'];
  onDelete: () => void;
  completed?: boolean;
}) {
  const pct       = progressPct(goal);
  const accentCol = completed ? colors.accent : colors.primary;

  return (
    <View style={[gcStyles.card, { borderColor: colors.border, backgroundColor: colors.surface }, shadows.sm]}>
      {/* Left accent bar */}
      <View style={[gcStyles.accentBar, { backgroundColor: accentCol }]} />

      <View style={gcStyles.body}>
        {/* Top row: icon + name + badges + delete */}
        <View style={gcStyles.topRow}>
          <Text style={{ fontSize: 26 }}>{goal.icon}</Text>
          <View style={gcStyles.info}>
            <Text style={[gcStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {goal.name}
            </Text>
            <View style={gcStyles.badges}>
              <View style={[gcStyles.badge, { backgroundColor: goal.type === 'goal' ? colors.primaryLight : colors.accentLight }]}>
                <Text style={[gcStyles.badgeText, { color: goal.type === 'goal' ? colors.primary : colors.accentDark }]}>
                  {goal.type === 'goal' ? '🎯 Goal' : '✨ Want'}
                </Text>
              </View>
              {completed && (
                <View style={[gcStyles.badge, { backgroundColor: colors.accentLight }]}>
                  <Text style={[gcStyles.badgeText, { color: colors.accentDark }]}>✓ Done</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Text style={{ fontSize: 15, color: colors.textMuted }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Progress section */}
        {goal.targetAmount > 0 ? (
          <View style={gcStyles.progressWrap}>
            <View style={gcStyles.amountRow}>
              <Text style={[gcStyles.currentAmt, { color: accentCol }]}>{fmt(goal.currentAmount)}</Text>
              <Text style={[gcStyles.targetAmt, { color: colors.textMuted }]}>of {fmt(goal.targetAmount)}</Text>
              <Text style={[gcStyles.pctText, { color: colors.textMuted }]}>{Math.round(pct * 100)}%</Text>
            </View>
            <ProgressBar pct={pct} color={accentCol} />
          </View>
        ) : (
          <View style={gcStyles.amountRow}>
            <Text style={[gcStyles.currentAmt, { color: accentCol }]}>{fmt(goal.currentAmount)}</Text>
            <Text style={[gcStyles.targetAmt, { color: colors.textMuted }]}>saved · no target</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const gcStyles = StyleSheet.create({
  card:      { borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing[3], overflow: 'hidden', flexDirection: 'row' },
  accentBar: { width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  body:      { flex: 1, padding: spacing[4], gap: spacing[3] },
  topRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  info:      { flex: 1, gap: 4 },
  name:      { fontSize: typography.base, fontWeight: typography.semibold, flexShrink: 1 },
  badges:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: typography.xs, fontWeight: typography.semibold },

  progressWrap: { gap: spacing[2] },
  amountRow:    { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  currentAmt:   { fontSize: typography.base, fontWeight: typography.bold },
  targetAmt:    { fontSize: typography.xs },
  pctText:      { fontSize: typography.xs, marginLeft: 'auto' as any },
});

// ─── Styles factory ────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], isDesktop = false) {
  const px = isDesktop ? spacing[8] : spacing[5];
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: colors.background },
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: px, paddingTop: isDesktop ? spacing[6] : spacing[5], paddingBottom: spacing[3] },
    headerText:  { gap: 2 },
    headerTitle: { fontSize: typography['2xl'], fontWeight: typography.bold, color: colors.textPrimary },
    headerSub:   { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.medium },
    addBtn:      { backgroundColor: colors.primary, paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.full },
    addBtnText:  { color: colors.textInverse, fontWeight: typography.semibold, fontSize: typography.sm },

    scroll:      { paddingHorizontal: px, paddingTop: spacing[2] },

    // Pool card
    poolCard:         { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing[5], marginBottom: spacing[5] },
    poolRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[4] },
    poolLabel:        { fontSize: typography.sm, fontWeight: typography.semibold, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
    poolBalance:      { fontSize: typography['3xl'], fontWeight: typography.bold, color: '#fff' },
    poolSub:          { fontSize: typography.xs, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
    poolStats:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: spacing[3], marginBottom: spacing[4] },
    poolStat:         { flex: 1, alignItems: 'center', gap: 2 },
    poolStatValue:    { fontSize: typography.base, fontWeight: typography.bold, color: '#fff' },
    poolStatLabel:    { fontSize: typography.xs, color: 'rgba(255,255,255,0.65)' },
    poolStatDivider:  { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
    allocateBtn:      { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.lg, paddingVertical: spacing[3], alignItems: 'center' },
    allocateBtnText:  { color: '#fff', fontWeight: typography.semibold, fontSize: typography.sm },

    sectionLabel: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing[3], marginTop: spacing[2] },

    // Goal grid
    goalGrid:          {},
    goalGridDesktop:   { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing[3] },
    goalGridItem:      {},
    goalGridItemDesktop: { width: '48%' as any },

    empty:      { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: spacing[8] },
    emptyTitle: { fontSize: typography.lg, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing[2] },
    emptySub:   { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', lineHeight: typography.base * typography.relaxed },

    // Modals
    modalRoot:   { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing[5], paddingTop: spacing[5] },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[5] },
    modalTitle:  { fontSize: typography.xl, fontWeight: typography.bold, color: colors.textPrimary },
    modalCancel: { fontSize: typography.base },

    poolMini:    { alignItems: 'center', marginBottom: spacing[5] },

    // Add goal form
    typeRow:     { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[2] },
    typePill:    { flex: 1, paddingVertical: spacing[3], alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: 'transparent', backgroundColor: colors.surfaceAlt },
    typePillText:{ fontSize: typography.sm, fontWeight: typography.semibold, color: colors.textSecondary },
    typeHint:    { fontSize: typography.xs, color: colors.textMuted, marginBottom: spacing[4] },
    emojiBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', marginRight: spacing[2] },
    fieldLabel:  { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing[2], marginTop: spacing[4] },
    input:       { borderWidth: 1, borderRadius: radius.lg, padding: spacing[4], fontSize: typography.base, marginBottom: spacing[2] },

    // Allocate / period-end
    allocGoalCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing[4], marginBottom: spacing[3] },
    allocGoalTop:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[3] },
    goalName:      { fontSize: typography.base, fontWeight: typography.semibold },
    goalProgress:  { fontSize: typography.xs, marginTop: 2 },
    allocInputRow: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
    allocInput:    { flex: 1, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing[3], paddingVertical: spacing[2], fontSize: typography.base },
    contributeBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.lg },
    contributeBtnText: { color: colors.textInverse, fontWeight: typography.semibold, fontSize: typography.sm },
    saveAllBtn:    { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1.5 },
    saveAllBtnText:{ fontWeight: typography.semibold, fontSize: typography.sm },

    // Surplus banner
    surplusBanner: { borderRadius: radius.xl, padding: spacing[5], marginBottom: spacing[5], alignItems: 'center' },
    surplusLabel:  { fontSize: typography.sm, fontWeight: typography.medium },
    surplusAmount: { fontSize: typography['2xl'], fontWeight: typography.bold, marginVertical: 4 },
    surplusSub:    { fontSize: typography.sm, textAlign: 'center', opacity: 0.8 },

    // Buttons
    primaryBtn:     { borderRadius: radius.lg, paddingVertical: spacing[4], alignItems: 'center' },
    primaryBtnText: { color: colors.textInverse, fontWeight: typography.bold, fontSize: typography.base },
    skipBtn:        { paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[2] },
    skipBtnText:    { fontSize: typography.sm },

    // Celebration
    celebOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing[8] },
    celebCard:    { borderRadius: radius.xl, padding: spacing[8], alignItems: 'center', width: '100%' },
    celebTitle:   { fontSize: typography['2xl'], fontWeight: typography.bold, marginBottom: spacing[1] },
    celebName:    { fontSize: typography.xl, fontWeight: typography.semibold, marginBottom: spacing[1] },
    celebAmount:  { fontSize: typography.base },
  });
}
