/**
 * AIAdvisorScreen — a chat-style interface for the AI budget advisor.
 *
 * Layout:
 *   • Scrollable message list
 *       – User bubble (right-aligned, blue)
 *       – AI response bubble (left-aligned, white) with a nested
 *         "Budget Adjustment Summary" card inside the message
 *   • Sticky input bar at the bottom (no API calls yet — purely visual)
 */

import React, { useRef } from 'react';
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
} from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../theme';
import ProgressBar from '../components/ProgressBar';

// ─── Types ───────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'ai';

interface BudgetAdjustment {
  category: string;
  from: number;
  to: number;
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  /** Optional nested summary card — only shown in AI messages */
  adjustments?: BudgetAdjustment[];
}

// ─── Placeholder messages ────────────────────────────────────────────────────

const MESSAGES: Message[] = [
  {
    id: '1',
    role: 'user',
    text: "I've been overspending on dining out and entertainment this month. Can you adjust my budget to help me pay off my car loan faster?",
  },
  {
    id: '2',
    role: 'ai',
    text: "Great goal! Based on your current spending patterns I've drafted a few adjustments that free up an extra $115 per month. I've trimmed discretionary categories and redirected the savings to your car payment. Here's the proposed plan:",
    adjustments: [
      { category: 'Dining Out',    from: 150, to: 80  },
      { category: 'Entertainment', from: 80,  to: 40  },
      { category: 'Subscriptions', from: 60,  to: 45  },
      { category: 'Car Payment',   from: 450, to: 565 },
    ],
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

/** A single row inside the budget adjustment summary card */
function AdjustmentRow({ item }: { item: BudgetAdjustment }) {
  const isIncrease = item.to > item.from;
  const delta = Math.abs(item.to - item.from);
  const progress = Math.min(item.to / (item.from * 1.5), 1); // visual only

  return (
    <View style={styles.adjRow}>
      <View style={styles.adjHeader}>
        <Text style={styles.adjCategory}>{item.category}</Text>
        <View style={styles.adjAmounts}>
          <Text style={styles.adjFrom}>${item.from}</Text>
          <Text style={styles.adjArrow}> → </Text>
          <Text style={[styles.adjTo, isIncrease ? styles.adjIncrease : styles.adjDecrease]}>
            ${item.to}
          </Text>
          <Text style={[styles.adjDelta, isIncrease ? styles.adjIncrease : styles.adjDecrease]}>
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

/** The nested summary card embedded inside an AI message */
function AdjustmentCard({ adjustments }: { adjustments: BudgetAdjustment[] }) {
  return (
    <View style={styles.adjCard}>
      <View style={styles.adjCardHeader}>
        <View style={styles.adjCardDot} />
        <Text style={styles.adjCardTitle}>Budget Adjustment Summary</Text>
      </View>
      {adjustments.map((item) => (
        <AdjustmentRow key={item.category} item={item} />
      ))}
      {/* Accept / Decline buttons — no logic yet */}
      <View style={styles.adjActions}>
        <TouchableOpacity style={styles.adjAccept} activeOpacity={0.8}>
          <Text style={styles.adjAcceptText}>Apply Changes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.adjDecline} activeOpacity={0.8}>
          <Text style={styles.adjDeclineText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** A single chat bubble for user or AI messages */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI]}>
      {/* Avatar — AI only */}
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
      )}

      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI, shadows.sm]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}>
          {message.text}
        </Text>
        {/* Nested adjustment card — AI messages only */}
        {message.adjustments && message.adjustments.length > 0 && (
          <AdjustmentCard adjustments={message.adjustments} />
        )}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AIAdvisorScreen() {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/*
        KeyboardAvoidingView pushes the whole chat layout (message list +
        input bar) up when the keyboard opens so the input bar is never hidden.
        iOS 'padding': adds bottom padding equal to keyboard height minus offset.
        Android 'height': shrinks the KAV height — more reliable than 'padding'
        for fixed-bottom inputs. keyboardVerticalOffset accounts for the tab bar.
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatarBadge}>
              <Text style={styles.headerAvatarText}>✦</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Advisor</Text>
              <Text style={styles.headerSubtitle}>Powered by Claude</Text>
            </View>
          </View>
          {/* Online indicator */}
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Ready</Text>
          </View>
        </View>

        {/* ── Message list ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {/* Date divider */}
          <View style={styles.dateDivider}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>Today</Text>
            <View style={styles.dateLine} />
          </View>

          {MESSAGES.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </ScrollView>

        {/* ── Input bar ── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask about your budget…"
            placeholderTextColor={colors.textMuted}
            multiline
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendButton} activeOpacity={0.85}>
            <Text style={styles.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  headerAvatarBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 18,
    color: colors.textInverse,
  },
  headerTitle: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
    gap: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  onlineText: {
    fontSize: typography.xs,
    color: colors.accentDark,
    fontWeight: typography.semibold,
  },

  // Message list
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },

  // Date divider
  dateDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
    gap: spacing[3],
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dateText: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: typography.medium,
  },

  // Bubble rows
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAI: {
    justifyContent: 'flex-start',
  },

  // Avatar
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarText: {
    fontSize: 14,
    color: colors.textInverse,
  },

  // Bubbles
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing[3],
  },
  bubbleUser: {
    backgroundColor: colors.bubbleUser,
    borderBottomRightRadius: radius.sm,
  },
  bubbleAI: {
    backgroundColor: colors.bubbleAI,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    fontSize: typography.sm,
    lineHeight: typography.sm * typography.relaxed,
  },
  bubbleTextUser: {
    color: colors.textInverse,
  },
  bubbleTextAI: {
    color: colors.textPrimary,
  },

  // Adjustment card
  adjCard: {
    marginTop: spacing[3],
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  adjCardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  adjCardTitle: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },

  // Adjustment rows
  adjRow: {
    marginBottom: spacing[3],
  },
  adjHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adjCategory: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: typography.medium,
    flex: 1,
  },
  adjAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  adjFrom: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  adjArrow: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  adjTo: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
  },
  adjDelta: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
  },
  adjIncrease: {
    color: colors.accent,
  },
  adjDecrease: {
    color: colors.primary,
  },

  // Action buttons
  adjActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  adjAccept: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
  adjAcceptText: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: colors.textInverse,
  },
  adjDecline: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjDeclineText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
    color: colors.textSecondary,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    fontSize: typography.sm,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textInverse,
    lineHeight: typography.lg,
  },
});
