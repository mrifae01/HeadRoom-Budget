/**
 * AIAdvisorScreen — live Claude-powered budget chat.
 *
 * Architecture:
 *   • Messages are kept in local state.
 *   • On send, the full conversation history + the user's live budget context
 *     are posted to the Headroom backend, which calls Claude with tool-use.
 *   • When Claude calls `suggest_budget_adjustments`, the response includes
 *     an `adjustments` array that gets rendered as an interactive card.
 *   • Tapping "Apply Changes" on a card calls `applyAdjustments` in
 *     BudgetContext, which persists the new category limits immediately.
 */

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useBudget } from '../context/BudgetContext';
import ProgressBar from '../components/ProgressBar';
import { API_BASE_URL } from '../config/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'ai';

export interface BudgetAdjustment {
  category: string;
  from: number;
  to: number;
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  adjustments?: BudgetAdjustment[];
  /** Tracks whether the adjustment card has been acted on */
  adjustmentState?: 'applied' | 'dismissed';
}

// ─── Welcome message shown before the user types anything ────────────────────

const WELCOME: Message = {
  id: 'welcome',
  role: 'ai',
  text: "Hi! I'm your AI budget advisor. I can see your income, categories, debts, and recent spending.\n\nTry asking me something like:\n• \"Trim my dining budget so I can save more\"\n• \"Help me pay off my car loan faster\"\n• \"Where am I overspending this month?\"",
};

// ─── TypingIndicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const { colors } = useTheme();
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: -6, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,  duration: 280, useNativeDriver: true }),
          Animated.delay(480),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] }}>
      {/* AI avatar */}
      <View style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 14, color: colors.textInverse }}>✦</Text>
      </View>

      {/* Bubble with bouncing dots */}
      <View style={{
        backgroundColor: colors.bubbleAI,
        borderRadius: radius.lg,
        borderBottomLeftRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[3],
        flexDirection: 'row',
        gap: 5,
        alignItems: 'center',
        ...shadows.sm,
      }}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={{
              width: 7, height: 7,
              borderRadius: 3.5,
              backgroundColor: colors.textMuted,
              transform: [{ translateY: dot }],
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─── AdjustmentRow ───────────────────────────────────────────────────────────

const createAdjRowStyles = (c: Colors) => StyleSheet.create({
  row: { marginBottom: spacing[3] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: {
    fontSize: typography.xs,
    color: c.textSecondary,
    fontWeight: typography.medium,
    flex: 1,
  },
  amounts: { flexDirection: 'row', alignItems: 'baseline' },
  from: { fontSize: typography.xs, color: c.textMuted, textDecorationLine: 'line-through' },
  arrow: { fontSize: typography.xs, color: c.textMuted },
  to: { fontSize: typography.xs, fontWeight: typography.bold },
  delta: { fontSize: typography.xs, fontWeight: typography.semibold },
  increase: { color: c.accent },
  decrease: { color: c.primary },
});

function AdjustmentRow({ item }: { item: BudgetAdjustment }) {
  const { colors } = useTheme();
  const s = useMemo(() => createAdjRowStyles(colors), [colors]);

  const isIncrease = item.to > item.from;
  const delta      = Math.abs(item.to - item.from);
  const progress   = Math.min(item.to / (item.from * 1.5 || 1), 1);

  return (
    <View style={s.row}>
      <View style={s.header}>
        <Text style={s.category}>{item.category}</Text>
        <View style={s.amounts}>
          <Text style={s.from}>${item.from}</Text>
          <Text style={s.arrow}> → </Text>
          <Text style={[s.to, isIncrease ? s.increase : s.decrease]}>${item.to}</Text>
          <Text style={[s.delta, isIncrease ? s.increase : s.decrease]}>
            {isIncrease ? ' +' : ' –'}${delta}
          </Text>
        </View>
      </View>
      <ProgressBar
        progress={progress}
        color={isIncrease ? colors.accent : colors.primary}
        height={5}
        style={{ marginTop: 4 }}
      />
    </View>
  );
}

// ─── AdjustmentCard ──────────────────────────────────────────────────────────

const createAdjCardStyles = (c: Colors) => StyleSheet.create({
  card: {
    marginTop: spacing[3],
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: c.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
  title: { fontSize: typography.sm, fontWeight: typography.bold, color: c.textPrimary },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  applyBtn: {
    flex: 1, backgroundColor: c.primary,
    borderRadius: radius.md, paddingVertical: spacing[2], alignItems: 'center',
  },
  applyBtnDone: { backgroundColor: c.accent },
  applyText: { fontSize: typography.xs, fontWeight: typography.bold, color: c.textInverse },
  dismissBtn: {
    flex: 1, backgroundColor: c.surface,
    borderRadius: radius.md, paddingVertical: spacing[2], alignItems: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  dismissText: { fontSize: typography.xs, fontWeight: typography.medium, color: c.textSecondary },
  appliedBanner: {
    marginTop: spacing[2],
    backgroundColor: c.accentLight,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.accent + '40',
  },
  appliedText: { fontSize: typography.xs, fontWeight: typography.semibold, color: c.accent },
});

function AdjustmentCard({
  adjustments,
  state,
  onApply,
  onDismiss,
}: {
  adjustments: BudgetAdjustment[];
  state?: 'applied' | 'dismissed';
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createAdjCardStyles(colors), [colors]);

  if (state === 'dismissed') return null;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.dot} />
        <Text style={s.title}>Budget Adjustment Summary</Text>
      </View>

      {adjustments.map((item) => (
        <AdjustmentRow key={item.category} item={item} />
      ))}

      {state === 'applied' ? (
        <View style={s.appliedBanner}>
          <Text style={s.appliedText}>✓  Changes applied to your budget</Text>
        </View>
      ) : (
        <View style={s.actions}>
          <TouchableOpacity style={s.applyBtn} onPress={onApply} activeOpacity={0.8}>
            <Text style={s.applyText}>Apply Changes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={s.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────────────

const createBubbleStyles = (c: Colors) => StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  rowUser: { justifyContent: 'flex-end' },
  rowAI:   { justifyContent: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  avatarText: { fontSize: 14, color: c.textInverse },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, padding: spacing[3] },
  bubbleUser: {
    backgroundColor: c.bubbleUser,
    borderBottomRightRadius: radius.sm,
  },
  bubbleAI: {
    backgroundColor: c.bubbleAI,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  text: { fontSize: typography.sm, lineHeight: typography.sm * typography.relaxed },
  textUser: { color: c.textInverse },
  textAI:   { color: c.textPrimary },
});

function MessageBubble({
  message,
  onApply,
  onDismiss,
}: {
  message: Message;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createBubbleStyles(colors), [colors]);
  const isUser = message.role === 'user';

  return (
    <View style={[s.row, isUser ? s.rowUser : s.rowAI]}>
      {!isUser && (
        <View style={s.avatar}>
          <Text style={s.avatarText}>✦</Text>
        </View>
      )}

      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAI, shadows.sm]}>
        <Text style={[s.text, isUser ? s.textUser : s.textAI]}>
          {message.text}
        </Text>

        {message.adjustments && message.adjustments.length > 0 && (
          <AdjustmentCard
            adjustments={message.adjustments}
            state={message.adjustmentState}
            onApply={onApply}
            onDismiss={onDismiss}
          />
        )}
      </View>
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const createStyles = (c: Colors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: c.background },
  flex:    { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 18, color: c.textInverse },
  headerTitle:      { fontSize: typography.base, fontWeight: typography.bold, color: c.textPrimary },
  headerSubtitle:   { fontSize: typography.xs, color: c.textMuted },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.accentLight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
    gap: 5,
  },
  onlineDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
  onlineText: { fontSize: typography.xs, color: c.accentDark, fontWeight: typography.semibold },
  list:        { flex: 1 },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  dateDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2], gap: spacing[3] },
  dateLine:    { flex: 1, height: 1, backgroundColor: c.border },
  dateText:    { fontSize: typography.xs, color: c.textMuted, fontWeight: typography.medium },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    fontSize: typography.sm,
    color: c.textPrimary,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive:    { backgroundColor: c.primary },
  sendBtnInactive:  { backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
  sendBtnText:      { fontSize: typography.lg, fontWeight: typography.bold, color: c.textInverse, lineHeight: typography.lg },
  sendBtnTextMuted: { color: c.textMuted },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AIAdvisorScreen() {
  const { colors, isDark }   = useTheme();
  const { budget, applyAdjustments } = useBudget();
  const styles    = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

  const [messages,   setMessages]   = useState<Message[]>([WELCOME]);
  const [inputText,  setInputText]  = useState('');
  const [isLoading,  setIsLoading]  = useState(false);

  // Auto-scroll to bottom whenever messages change or typing indicator shows
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── Send a message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    // Add user bubble immediately
    const userMsg: Message = { id: uid(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      // Build the message history in Claude's format (skip the static welcome)
      const allMessages = [...messages, userMsg].filter((m) => m.id !== 'welcome');
      const claudeMessages = allMessages.map((m) => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      // Build a lean budget context snapshot to send with every request
      const sortedTx = [...budget.transactions].sort(
        (a, b) => (b.date > a.date ? 1 : -1),
      );
      const budgetContext = {
        incomeSources: budget.incomeSources,
        categories:    budget.categories,
        debts:         budget.debts,
        transactions:  sortedTx.slice(0, 30), // most recent 30 only
      };

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: claudeMessages, budgetContext }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json();

      const aiMsg: Message = {
        id:          uid(),
        role:        'ai',
        text:        data.text || "I couldn't generate a response. Please try again.",
        adjustments: data.adjustments ?? undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);

    } catch (err: unknown) {
      console.error('[AIAdvisorScreen] send failed:', err);
      const errMsg: Message = {
        id:   uid(),
        role: 'ai',
        text: "Sorry, I couldn't reach the server. Make sure the backend is running and try again.",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, messages, budget]);

  // ── Apply AI-suggested adjustments ─────────────────────────────────────────
  const handleApply = useCallback(
    async (msgId: string, adjustments: BudgetAdjustment[]) => {
      // Persist the new category limits via BudgetContext
      await applyAdjustments(
        adjustments.map((a) => ({ categoryName: a.category, newAmount: a.to })),
      );
      // Mark the card as applied so it shows the confirmation banner
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, adjustmentState: 'applied' as const } : m,
        ),
      );
    },
    [applyAdjustments],
  );

  const handleDismiss = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, adjustmentState: 'dismissed' as const } : m,
      ),
    );
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>✦</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Advisor</Text>
              <Text style={styles.headerSubtitle}>Powered by Claude</Text>
            </View>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Ready</Text>
          </View>
        </View>

        {/* ── Message list ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
        >
          <View style={styles.dateDivider}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>Today</Text>
            <View style={styles.dateLine} />
          </View>

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onApply={() => msg.adjustments && handleApply(msg.id, msg.adjustments)}
              onDismiss={() => handleDismiss(msg.id)}
            />
          ))}

          {/* Typing indicator — shown while waiting for Claude */}
          {isLoading && <TypingIndicator />}
        </ScrollView>

        {/* ── Input bar ── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask about your budget…"
            placeholderTextColor={colors.textMuted}
            multiline
            returnKeyType="send"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, inputText.trim() && !isLoading ? styles.sendBtnActive : styles.sendBtnInactive]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={!inputText.trim() || isLoading}
            accessibilityLabel="Send message"
          >
            <Text style={[styles.sendBtnText, !(inputText.trim() && !isLoading) && styles.sendBtnTextMuted]}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
