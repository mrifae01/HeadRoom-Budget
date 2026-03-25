/**
 * ReportsScreen — shows all archived monthly records as a scrollable list.
 * Tapping a month card navigates to MonthDetailScreen for the full breakdown.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/RootNavigator';
import { MonthlyRecord } from '../types/budget';
import {
  getMonthsIndex,
  loadMonthlyRecord,
  deleteMonthlyRecord,
  formatMonthLabel,
  formatMonthShort,
} from '../storage/reports';
import { seedSampleReports, clearSampleReports } from '../dev/seedReports';
import ProgressBar from '../components/ProgressBar';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dollars(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Returns "saved $X" or "over by $X" */
function savingsSummary(income: number, spent: number): { label: string; over: boolean } {
  const diff = income - spent;
  if (diff >= 0) return { label: `Saved ${dollars(diff)}`, over: false };
  return { label: `Over by ${dollars(Math.abs(diff))}`, over: true };
}

// ─── MonthCard ───────────────────────────────────────────────────────────────

const createCardStyles = (c: Colors) => StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  monthName: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  savingsBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  savingsText: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
  },
  spentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing[2],
  },
  spentAmount: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: c.textPrimary,
  },
  budgetAmount: {
    fontSize: typography.sm,
    color: c.textMuted,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: spacing[3],
    flexWrap: 'wrap',
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
  },
  chevron: {
    fontSize: 20,
    color: c.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[3],
  },
  stat: {
    flex: 1,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing[2] + 2,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  statLabel: {
    fontSize: typography.xs - 1,
    color: c.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  viewBtn: {
    flex: 1,
    backgroundColor: c.primaryLight,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.primary,
  },
  deleteBtn: {
    backgroundColor: c.dangerLight,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.danger,
  },
});

function MonthCard({
  record,
  onPress,
  onDelete,
}: {
  record: MonthlyRecord;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createCardStyles(colors), [colors]);

  const { totalSpent, totalBudgeted, categoryBreakdown } = record.summary;
  const progress    = totalBudgeted > 0 ? Math.min(totalSpent / totalBudgeted, 1) : 0;
  const { label: savLabel, over } = savingsSummary(record.income, totalSpent);
  const topCategories = [...categoryBreakdown]
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  return (
    <View style={s.card}>
      {/* Tappable content area → navigates to detail */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {/* Month name + savings badge */}
        <View style={s.topRow}>
          <Text style={s.monthName}>{formatMonthLabel(record.month)}</Text>
          <View style={[s.savingsBadge, { backgroundColor: over ? colors.dangerLight : colors.accentLight }]}>
            <Text style={[s.savingsText, { color: over ? colors.danger : colors.accent }]}>
              {savLabel}
            </Text>
          </View>
        </View>

        {/* Spent vs budgeted */}
        <View style={s.spentRow}>
          <Text style={s.spentAmount}>{dollars(totalSpent)} spent</Text>
          <Text style={s.budgetAmount}>of {dollars(totalBudgeted)}</Text>
        </View>
        <ProgressBar
          progress={progress}
          color={over ? colors.danger : colors.primary}
          trackColor={colors.surfaceAlt}
          height={7}
        />

        {/* Category colour dots (top 5) */}
        <View style={s.dotsRow}>
          {topCategories.map((cat) => (
            <View key={cat.name} style={[s.dot, { backgroundColor: cat.color }]} />
          ))}
        </View>

        {/* Quick stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {dollars(record.income)}
            </Text>
            <Text style={s.statLabel} numberOfLines={1}>Income</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {dollars(record.debtTotal)}
            </Text>
            <Text style={s.statLabel} numberOfLines={1}>Debt Pmts</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {record.transactions.length}
            </Text>
            <Text style={s.statLabel} numberOfLines={1}>Activity</Text>
          </View>
          <View style={s.stat}>
            <Text
              style={[s.statValue, { color: over ? colors.danger : colors.accent }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {Math.round(record.summary.savingsRate * 100)}%
            </Text>
            <Text style={s.statLabel} numberOfLines={1}>Saved</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Action row: View + Delete — siblings, not nested inside the nav touchable */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.viewBtn} activeOpacity={0.8} onPress={onPress}>
          <Text style={s.viewBtnText}>View Full Report  →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={onDelete}
          activeOpacity={0.75}
          accessibilityLabel="Delete report"
        >
          <Text style={s.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const createStyles = (c: Colors) => StyleSheet.create({
  safe:     { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  backText:    { fontSize: typography.lg, color: c.textPrimary, lineHeight: 22 },
  headerTitle: { fontSize: typography.xl, fontWeight: typography.bold, color: c.textPrimary },
  scroll:      { flex: 1 },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: typography.lg, fontWeight: typography.bold, color: c.textPrimary, textAlign: 'center' },
  emptyBody:  { fontSize: typography.sm, color: c.textSecondary, textAlign: 'center', lineHeight: typography.sm * 1.6 },
  seedBtn: {
    marginTop: spacing[2],
    backgroundColor: c.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
  },
  seedBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: c.textInverse,
  },
  seedBtnDisabled: { opacity: 0.5 },
  resetBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: c.border,
    marginLeft: 'auto' as any,
  },
  resetBtnText: {
    fontSize: typography.xs,
    color: c.textMuted,
  },
  sectionLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing[3],
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [records,   setRecords]   = useState<MonthlyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  // Load all monthly records (extracted so we can call it after seeding too)
  const loadRecords = useCallback(async () => {
    try {
      const index  = await getMonthsIndex();
      const loaded = await Promise.all(index.map((m) => loadMonthlyRecord(m)));
      setRecords(loaded.filter((r): r is MonthlyRecord => r !== null));
    } catch (err) {
      console.error('[ReportsScreen] load failed:', err);
    }
  }, []);

  useEffect(() => {
    loadRecords().finally(() => setIsLoading(false));
  }, [loadRecords]);

  const handlePress = useCallback((month: string) => {
    navigation.navigate('MonthDetail', { month });
  }, [navigation]);

  const handleDelete = useCallback((record: MonthlyRecord) => {
    Alert.alert(
      'Delete Report',
      `Are you sure you want to permanently delete the ${formatMonthLabel(record.month)} report? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMonthlyRecord(record.month);
            await loadRecords();
          },
        },
      ],
    );
  }, [loadRecords]);

  // ── Dev helpers ──────────────────────────────────────────────────────────────

  const handleSeed = useCallback(async () => {
    setIsSeeding(true);
    try {
      const written = await seedSampleReports();
      await loadRecords();
      if (written === 0) {
        Alert.alert('Already seeded', 'Sample data is already present.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to seed sample data.');
      console.error('[ReportsScreen] seed failed:', err);
    } finally {
      setIsSeeding(false);
    }
  }, [loadRecords]);

  const handleClear = useCallback(() => {
    Alert.alert(
      'Clear Sample Data',
      'This will remove the 4 seeded months. Real archived months are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearSampleReports();
            await loadRecords();
          },
        },
      ],
    );
  }, [loadRecords]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.surface}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monthly Reports</Text>

        {/* Dev reset button — only shown when sample data exists */}
        {records.length > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={handleClear}>
            <Text style={styles.resetBtnText}>Reset Sample</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : records.length === 0 ? (
        /* ── Empty state with seed button ── */
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptyBody}>
            Reports are created automatically when a month ends. Once your first
            month rolls over you'll see a full breakdown here.
          </Text>

          {/* Load sample data for visualisation testing */}
          <TouchableOpacity
            style={[styles.seedBtn, isSeeding && styles.seedBtnDisabled]}
            onPress={handleSeed}
            disabled={isSeeding}
            activeOpacity={0.8}
          >
            {isSeeding ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.seedBtnText}>✦  Load Sample Data</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>
            {records.length} month{records.length === 1 ? '' : 's'} archived
          </Text>

          {records.map((record) => (
            <MonthCard
              key={record.month}
              record={record}
              onPress={() => handlePress(record.month)}
              onDelete={() => handleDelete(record)}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
