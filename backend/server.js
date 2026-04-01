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
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase admin client (service role — never exposed to frontend) ──────────

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Teller helpers ────────────────────────────────────────────────────────────

function tellerAuth(accessToken) {
  return 'Basic ' + Buffer.from(accessToken + ':').toString('base64');
}

async function tellerFetch(path, accessToken) {
  const res = await fetch(`https://api.teller.io${path}`, {
    headers: { Authorization: tellerAuth(accessToken) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Teller ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user.id;
}

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

// ─── Teller routes ────────────────────────────────────────────────────────────

/**
 * POST /api/teller/enroll
 * Body: { accessToken, institutionName, enrollmentId }
 * Verifies the token against Teller, then upserts enrollment into Supabase.
 */
app.post('/api/teller/enroll', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { accessToken, institutionName, enrollmentId } = req.body;
    if (!accessToken || !institutionName || !enrollmentId) {
      return res.status(400).json({ error: 'accessToken, institutionName and enrollmentId are required' });
    }

    // Verify the token actually works before storing it
    await tellerFetch('/accounts', accessToken);

    const { error } = await supabaseAdmin
      .from('teller_enrollments')
      .upsert(
        {
          user_id:          userId,
          access_token:     accessToken,
          institution_name: institutionName,
          enrollment_id:    enrollmentId,
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/teller/enroll]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Enrollment failed' });
  }
});

/**
 * GET /api/teller/accounts
 * Returns connected accounts or { accounts: [], connected: false }.
 */
app.get('/api/teller/accounts', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: enrollment, error } = await supabaseAdmin
      .from('teller_enrollments')
      .select('access_token, institution_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!enrollment) {
      return res.json({ accounts: [], connected: false });
    }

    const accounts = await tellerFetch('/accounts', enrollment.access_token);

    res.json({
      accounts,
      institutionName: enrollment.institution_name,
      connected: true,
    });
  } catch (err) {
    console.error('[GET /api/teller/accounts]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Failed to fetch accounts' });
  }
});

/**
 * GET /api/teller/transactions
 * Fetches transactions for all connected accounts, merges, sorts, returns first 90.
 */
app.get('/api/teller/transactions', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: enrollment, error } = await supabaseAdmin
      .from('teller_enrollments')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!enrollment) return res.json({ transactions: [] });

    const accounts = await tellerFetch('/accounts', enrollment.access_token);

    const txArrays = await Promise.all(
      accounts.map(async (account) => {
        const txs = await tellerFetch(`/accounts/${account.id}/transactions`, enrollment.access_token);
        return txs.map((tx) => ({
          ...tx,
          accountName: account.name,
          accountType: account.type,
        }));
      }),
    );

    const merged = txArrays
      .flat()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 90);

    res.json({ transactions: merged });
  } catch (err) {
    console.error('[GET /api/teller/transactions]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Failed to fetch transactions' });
  }
});

/**
 * DELETE /api/teller/disconnect
 * Removes the enrollment record for the authenticated user.
 */
app.delete('/api/teller/disconnect', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { error } = await supabaseAdmin
      .from('teller_enrollments')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/teller/disconnect]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Disconnect failed' });
  }
});

// ─── Bank analysis route ──────────────────────────────────────────────────────

const BUDGET_SETUP_TOOL = {
  name: 'suggest_budget_setup',
  description: `Analyse the user's real bank transactions and suggest a complete
budget setup. Map spending to the 12 preset categories exactly as listed.
Always call this tool — never describe numbers in plain text.`,
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-3 sentence plain-English summary of what you found and why you made these suggestions.',
      },
      incomeSources: {
        type: 'array',
        description: 'Detected recurring income or savings sources.',
        items: {
          type: 'object',
          properties: {
            name:   { type: 'string', description: 'Descriptive label, e.g. "Direct Deposit".' },
            amount: { type: 'string', description: 'Monthly amount as a whole-dollar string, e.g. "3200".' },
            type:   { type: 'string', enum: ['income', 'no_income'], description: '"income" for paycheck/salary, "no_income" for savings draw.' },
          },
          required: ['name', 'amount', 'type'],
        },
      },
      categories: {
        type: 'array',
        description: 'Suggested monthly budget limits. Only include categories from this exact list: Rent/Mortgage, Groceries, Utilities, Transportation, Car/Gas, Dining Out, Entertainment, Fun, Insurance, Child, Pet, Other/Misc.',
        items: {
          type: 'object',
          properties: {
            name:   { type: 'string', description: 'Exact category name from the allowed list.' },
            amount: { type: 'string', description: 'Monthly budget limit as a whole-dollar string.' },
          },
          required: ['name', 'amount'],
        },
      },
      debts: {
        type: 'array',
        description: 'Detected recurring debt or loan payments.',
        items: {
          type: 'object',
          properties: {
            name:        { type: 'string', description: 'Debt name, e.g. "Student Loan".' },
            amount:      { type: 'string', description: 'Monthly payment as a whole-dollar string.' },
            totalAmount: { type: 'string', description: 'Estimated total balance if determinable, else omit.' },
          },
          required: ['name', 'amount'],
        },
      },
    },
    required: ['summary', 'incomeSources', 'categories', 'debts'],
  },
};

/**
 * POST /api/bank/analyze
 * Fetches the user's Teller transactions, sends them to Claude, and returns
 * structured budget suggestions.
 */
app.post('/api/bank/analyze', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: enrollment, error: dbErr } = await supabaseAdmin
      .from('teller_enrollments')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (dbErr) throw dbErr;
    if (!enrollment) return res.status(400).json({ error: 'No bank connected' });

    // Fetch accounts + transactions
    const accounts = await tellerFetch('/accounts', enrollment.access_token);
    const txArrays = await Promise.all(
      accounts.map(async (account) => {
        const txs = await tellerFetch(`/accounts/${account.id}/transactions`, enrollment.access_token);
        return txs.map((tx) => ({ ...tx, accountName: account.name }));
      }),
    );
    const transactions = txArrays
      .flat()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 60);

    const txLines = transactions
      .map((t) => {
        const amt    = parseFloat(t.amount);
        const sign   = amt < 0 ? '-' : '+';
        const name   = t.details?.counterparty?.name ?? t.description ?? '';
        return `${t.date}  ${sign}$${Math.abs(amt).toFixed(2)}  ${name}  (${t.accountName})`;
      })
      .join('\n');

    const systemPrompt = `You are a personal finance analyst. Analyse the bank transactions below and
call suggest_budget_setup with a complete budget suggestion.

ALLOWED CATEGORIES (use exact names only):
Rent/Mortgage, Groceries, Utilities, Transportation, Car/Gas, Dining Out,
Entertainment, Fun, Insurance, Child, Pet, Other/Misc

TRANSACTIONS (most recent first):
${txLines}

Rules:
• Whole-dollar amounts only (no cents).
• Identify recurring credits as income sources.
• Identify recurring fixed payments (loans, subscriptions) as debts if they look like financing.
• Map all spending to the 12 allowed categories; use Other/Misc as a catch-all.
• Be conservative — suggest limits slightly above observed spending.`;

    const resp = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      [BUDGET_SETUP_TOOL],
      tool_choice: { type: 'any' },
      messages:   [{ role: 'user', content: 'Please analyse my transactions and suggest a budget setup.' }],
    });

    const toolBlock = resp.content.find((b) => b.type === 'tool_use');
    if (!toolBlock) return res.status(500).json({ error: 'No analysis returned' });

    const { summary, incomeSources, categories, debts } = toolBlock.input;
    res.json({ summary, incomeSources, categories, debts });
  } catch (err) {
    console.error('[POST /api/bank/analyze]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Analysis failed' });
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
