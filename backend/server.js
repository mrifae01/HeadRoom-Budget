/**
 * Headroom AI Advisor — Express backend
 *
 * POST /api/chat
 *   Body:  { messages: ClaudeMessage[], budgetContext: BudgetContext }
 *   Reply: { text: string, adjustments: Adjustment[] | null }
 *
 * Uses Claude's tool-use feature so the AI can propose structured budget
 * adjustments that the app renders as interactive visualisation cards.
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk/index.js');

// ─── Setup ────────────────────────────────────────────────────────────────────

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Tool definition ──────────────────────────────────────────────────────────
// When Claude decides to propose budget changes it MUST call this tool.
// The app picks up the structured `adjustments` array and renders
// the visual "Budget Adjustment Summary" card.

const BUDGET_TOOL = {
  name: 'suggest_budget_adjustments',
  description: `Call this tool whenever you want to propose specific dollar changes
to the user's budget categories. The app will render a visual adjustment card
so the user can one-tap accept or dismiss your proposal. Always call this tool
for concrete budget changes — never just describe numbers in plain text.`,
  input_schema: {
    type: 'object',
    properties: {
      adjustments: {
        type: 'array',
        description: 'List of categories to change. Only include categories that actually change.',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Exact category name as it appears in the user\'s budget.',
            },
            from: {
              type: 'number',
              description: 'Current monthly budget for this category (whole dollars).',
            },
            to: {
              type: 'number',
              description: 'Proposed new monthly budget (whole dollars).',
            },
          },
          required: ['category', 'from', 'to'],
        },
      },
    },
    required: ['adjustments'],
  },
};

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx) {
  const { incomeSources = [], categories = [], debts = [], transactions = [] } = ctx;

  const totalIncome  = incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDebt    = debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const spendable    = Math.max(totalIncome - totalDebt, 0);
  const totalBudgeted = categories.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

  const incomeLines = incomeSources.length
    ? incomeSources.map(i => `  • ${i.name}: $${parseFloat(i.amount || 0).toLocaleString()}/mo`).join('\n')
    : '  • None set up';

  const debtLines = debts.length
    ? debts.map(d => {
        const monthly = parseFloat(d.amount || 0);
        const total   = parseFloat(d.totalAmount || 0);
        const forecast = monthly > 0 && total > 0
          ? ` — paid off in ~${Math.ceil(total / monthly)} months`
          : '';
        return `  • ${d.name}: $${monthly.toLocaleString()}/mo${forecast}`;
      }).join('\n')
    : '  • None';

  const categoryLines = categories.length
    ? categories.map(c => `  • ${c.icon} ${c.name}: $${parseFloat(c.amount || 0).toLocaleString()}/mo`).join('\n')
    : '  • No categories set up';

  // Most recent 20 transactions only — keeps tokens lean
  const recent = [...transactions]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 20);

  const txLines = recent.length
    ? recent.map(t => `  • ${t.date}  ${t.categoryName}  -$${t.amount}${t.note ? `  (${t.note})` : ''}`).join('\n')
    : '  • No transactions recorded yet';

  return `You are a sharp, friendly personal finance advisor embedded in Headroom — a mobile budgeting app.

════ USER'S BUDGET SNAPSHOT ════

Monthly Income:    $${totalIncome.toLocaleString()}
Debt Payments:    -$${totalDebt.toLocaleString()}/mo
Spendable Budget:  $${spendable.toLocaleString()}/mo
Total Budgeted:    $${totalBudgeted.toLocaleString()}/mo

Income Sources:
${incomeLines}

Debt Obligations:
${debtLines}

Budget Categories (monthly limits):
${categoryLines}

Recent Transactions:
${txLines}

════ YOUR BEHAVIOUR ════

• Be concise, warm, and direct — no filler phrases.
• When the user asks to change, adjust, optimise, or rebalance their budget,
  ALWAYS call the suggest_budget_adjustments tool. This renders a visual card
  in the app. Only include categories that are actually changing.
• After calling the tool, write 1–3 sentences explaining your reasoning.
• Dollar amounts must be whole numbers (no cents).
• Never reference categories that don't exist in the user's budget.
• If the user asks a general question or wants analysis, answer directly — no tool call.
• If the numbers don't add up cleanly, acknowledge the trade-off honestly.`;
}

// ─── Chat endpoint ────────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, budgetContext } = req.body;

    if (!Array.isArray(messages) || !budgetContext) {
      return res.status(400).json({ error: '`messages` array and `budgetContext` object are required.' });
    }

    const systemPrompt = buildSystemPrompt(budgetContext);

    // ── First call — Claude may produce text, call the tool, or both ──────────
    const resp1 = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      [BUDGET_TOOL],
      messages,
    });

    let text        = '';
    let adjustments = null;
    let toolBlock   = null;

    for (const block of resp1.content) {
      if (block.type === 'text')     text       += block.text;
      if (block.type === 'tool_use') toolBlock   = block;
    }

    if (toolBlock) {
      adjustments = toolBlock.input.adjustments ?? null;
    }

    // ── If Claude used the tool but gave no pre-text, do a follow-up call ─────
    // (Claude sometimes speaks AFTER the tool result rather than before it)
    if (toolBlock && !text.trim()) {
      const resp2 = await client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 512,
        system:     systemPrompt,
        // Don't pass tools — we just want Claude's plain explanation
        messages: [
          ...messages,
          { role: 'assistant', content: resp1.content },
          {
            role: 'user',
            content: [{
              type:        'tool_result',
              tool_use_id: toolBlock.id,
              content:     'Adjustments rendered in app.',
            }],
          },
        ],
      });

      for (const block of resp2.content) {
        if (block.type === 'text') text += block.text;
      }
    }

    res.json({
      text:        text.trim() || "Here's what I'd propose:",
      adjustments,
    });

  } catch (err) {
    console.error('[/api/chat]', err?.status, err?.message);
    const status  = err?.status ?? 500;
    const message = err?.status === 401
      ? 'Invalid API key — check your ANTHROPIC_API_KEY in .env'
      : 'Something went wrong on the AI server. Please try again.';
    res.status(status).json({ error: message });
  }
});

// ─── Health check (useful for deployment monitoring) ─────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🧠 Headroom AI backend running on http://localhost:${PORT}`);
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING — set ANTHROPIC_API_KEY in .env'}\n`);
});
