-- Schema for data/pfm.sqlite3. See data/schema.md for a human-readable
-- description of each table. Idempotent (CREATE TABLE IF NOT EXISTS) so
-- running it against an existing DB file is always safe.

CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('msb', 'self_reported', 'estimated', 'mock')),
  created_at TEXT NOT NULL,
  UNIQUE (cif, bank_name, account_number)
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_cif ON beneficiaries (cif);
-- Spending jars ("hũ"), per persona (`cif`). A jar is a GROUP of expense
-- categories with an optional monthly limit (`budget_limit`); NULL means "chưa
-- đặt" — never a silent 0 (invariant #6). The limit is the monthly PLAN, not the
-- balance: a jar's running balance is DERIVED (invariant #1) from `jar_ledger`
-- plus spend since `created_at` (its anchor). Every expense category belongs to
-- exactly one jar, enforced server-side by the /api/jars route handlers.
CREATE TABLE IF NOT EXISTS jars (
  id TEXT NOT NULL,
  cif TEXT NOT NULL,
  label TEXT NOT NULL,
  category_ids TEXT NOT NULL,      -- JSON array of category id strings
  budget_limit REAL,               -- NULL = "chưa đặt" (Đã set), never 0
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL,     -- display order (a jar added later sorts last)
  created_at TEXT,                 -- ISO; running-balance anchor. Nullable only for ALTER compat (db.ts backfills)
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_jars_cif ON jars (cif);

-- Per-jar deposit/withdraw ledger, per persona (`cif`). A DISPLAY partition of
-- CASA — never money movement (invariant #3) and always `self_reported` (#5).
-- Every amount is > 0 except the ONE opening deposit per jar (`is_opening = 1`),
-- which may be 0 so a jar created with balance 0 reads 0, not unknown (#6).
-- Inter-jar moves are NOT stored here (they stay `dieu-chinh-hu` txns). Rows of a
-- jar removed from the config are deleted with it (`writeJarConfig`).
CREATE TABLE IF NOT EXISTS jar_ledger (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  jar_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdraw')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  is_opening INTEGER NOT NULL DEFAULT 0 CHECK (is_opening IN (0, 1)),
  created_at TEXT NOT NULL,        -- ISO 8601
  source TEXT NOT NULL DEFAULT 'self_reported' CHECK (source = 'self_reported'),
  CHECK (amount > 0 OR is_opening = 1),
  CHECK (is_opening = 0 OR kind = 'deposit'),
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_jar_ledger_cif_jar ON jar_ledger (cif, jar_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jar_ledger_opening ON jar_ledger (cif, jar_id) WHERE is_opening = 1;

-- Bank accounts per persona (`cif`) — the CASA source of truth. Previously pure
-- in-memory fixtures + a localStorage debit overlay; now a real table so a
-- transfer debits the balance server-side and it persists (mock core-banking).
-- `balance`/`available_balance` are mutated directly by a confirmed transfer
-- (see /api/accounts/debit). `sort_order` fixes display order (current first).
CREATE TABLE IF NOT EXISTS accounts (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('current', 'savings', 'credit_card')),
  institution TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance REAL NOT NULL,
  available_balance REAL NOT NULL,
  last_synced_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('msb', 'self_reported', 'estimated', 'mock')),
  tier TEXT,                       -- NULL for accounts with no membership tier
  masked_number TEXT NOT NULL,
  account_number TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_cif ON accounts (cif);

-- ALL transactions per persona (`cif`) in ONE table, told apart by `source`:
--  - `mock` / `msb` — bank-provided history (standing in for MSB core-banking),
--    seeded lazily per persona from the deterministic generator
--    (`fixtures/generate.ts`) on first read. Read-only for the app.
--  - `self_reported` — records a user enters via the ＋ FAB, the transfer record a
--    confirmed transfer writes, and the `dieu-chinh-hu` rebalance legs. NOT money
--    movement (invariant #3), never bank-verified (#5).
-- Provenance never mixes (#5): every app write/delete is scoped to
-- `source = 'self_reported'` and can never touch a bank row; bank reads/seeding
-- are scoped to `source <> 'self_reported'`. The rich `Transaction` shape is a
-- JSON `payload` (same JSON-in-column pattern as `jars.category_ids`);
-- `posted_at` is a column for period filtering + newest-first order.
-- (Replaces the former separate `manual_transactions` table — `db.ts` migrates it.)
CREATE TABLE IF NOT EXISTS transactions (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mock'
    CHECK (source IN ('mock', 'msb', 'self_reported')),
  posted_at TEXT NOT NULL,          -- ISO 8601
  payload TEXT NOT NULL,            -- full JSON Transaction
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_cif_posted ON transactions (cif, posted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_cif_source ON transactions (cif, source, posted_at);

-- The spending/transfer category taxonomy ("categories are data", invariant #7),
-- PER PERSONA (`cif`) — like `jars`, `transactions` and `transaction_corrections`.
-- Per-cif is load-bearing, not cosmetic: jars are per-cif and every expense
-- category belongs to exactly one jar, so a GLOBAL taxonomy would mean one
-- persona's new category becomes an orphan for EVERY persona and each one's next
-- `readJarConfig` silently heals it into their "Khác" jar.
-- Seeded lazily per cif from `src/domain/models/categories.ts` (INSERT OR IGNORE,
-- so a category added in code appears and an edited row is never clobbered).
-- Sentinels (`unclassified`, `income`, `dieu-chinh-hu`) are NOT categories and
-- never stored.
--  - `custom` 0 = bundled preset (rename/delete-locked through the API, 403),
--    1 = user-created. A SEPARATE axis from `fixed` (which means "fixed/recurring
--    cost" and feeds the cashflow fixed-vs-discretionary split) — never overload it.
--  - `archived_at` NULL = active. An archived category leaves the assignable set
--    (pickers, orphan-heal) but KEEPS its jar membership and stays "known", so no
--    historical jar total ever moves and old corrections still round-trip.
-- NOT BACKWARD COMPATIBLE with a pre-Phase-02 `data/pfm.sqlite3`: the old table
-- has no `cif` column and `CREATE TABLE IF NOT EXISTS` will not add one, so a
-- stale file fails loudly on the index below. Run `npm run db:seed`.
CREATE TABLE IF NOT EXISTS categories (
  cif TEXT NOT NULL,
  id TEXT NOT NULL,                 -- preset id, or `c_<slug>` for a custom one
  label TEXT NOT NULL,              -- Vietnamese display label
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'transfer')),
  fixed INTEGER NOT NULL,           -- 1 = fixed/recurring spend, 0 = discretionary
  custom INTEGER NOT NULL DEFAULT 0,-- 1 = user-created (rename/delete allowed)
  archived_at TEXT,                 -- ISO 8601; NULL = active
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);

CREATE INDEX IF NOT EXISTS idx_categories_cif ON categories (cif, sort_order);

-- Per-transaction category overlay per persona (`cif`): user corrections AND
-- AI/memory/heuristic assignments, plus the `hidden` flag. An overlay, never a
-- mutation of the bank row in `transactions` (invariant #4), so the original
-- category and the label's provenance (origin/confidence/status — #5) survive.
-- Previously browser localStorage only; now a real table so labels persist
-- across devices. `payload` is the normalized `Correction` JSON.
CREATE TABLE IF NOT EXISTS transaction_corrections (
  cif TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  payload TEXT NOT NULL,            -- JSON Correction {categoryId?, hidden?, origin, confidence?, status?}
  updated_at TEXT NOT NULL,
  PRIMARY KEY (cif, txn_id)
);

-- NOTE: the legacy `jar_allocations` table is retired (`db.ts` drops it on
-- connect). A jar's balance now comes from `jar_ledger` deposits/withdrawals;
-- `budget_limit` is only the monthly spending limit.

-- Proactive insights per persona (`cif`). Stores the history and state of
-- generated insights and their copies to avoid duplicate notifications.
CREATE TABLE IF NOT EXISTS proactive_insights (
  cif TEXT NOT NULL,
  insight_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  insight_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'superseded', 'dismissed', 'expired')),
  fingerprint TEXT NOT NULL,
  semantic_signature TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  copy_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (cif, insight_id, version)
);

CREATE INDEX IF NOT EXISTS idx_proactive_insights_active ON proactive_insights (cif, status);

-- User interaction events for proactive insights (e.g. displayed, dismissed).
CREATE TABLE IF NOT EXISTS proactive_insight_events (
  cif TEXT NOT NULL,
  insight_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('displayed', 'dismissed')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (cif, insight_id, version, event_type)
);

-- Temporary verified financial profile per persona (`cif`) synced from the browser.
CREATE TABLE IF NOT EXISTS proactive_financial_profiles (
  cif TEXT PRIMARY KEY,
  liabilities_json TEXT NOT NULL,
  goals_json TEXT NOT NULL,
  sync_token TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

-- One row per persona (`cif`): standing instructions/preferences the customer gives
-- M-You (plan 261013), never financial facts — see `data/schema.md`.
CREATE TABLE IF NOT EXISTS agent_preferences (
  cif TEXT PRIMARY KEY,
  response_length TEXT CHECK (response_length IS NULL OR response_length IN ('concise', 'balanced', 'detailed')),
  tone TEXT CHECK (tone IS NULL OR tone IN ('friendly', 'formal', 'playful')),
  risk_appetite TEXT CHECK (risk_appetite IS NULL OR risk_appetite IN ('cautious', 'balanced', 'aggressive')),
  address_as TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Scam Shield engine (notes: TASKS-engine E01). One row per persona (`cif`): the
-- customer's protection settings as JSON (`SecurityState`, src/state/security/types.ts).
-- Server-side so the rule engine and the fraud agent read the same copy the app shows.
CREATE TABLE IF NOT EXISTS security_profiles (
  cif TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Scam Shield engine (E02). Append-only log of what happened to a persona
-- (money in, transfers out, savings settled, device/password changes, screen
-- sharing, screens opened, warnings shown/answered). The signal engine reads
-- every time-window rule (60 min, 24 h, 10 min, 2 days…) from here.
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_cif_at ON security_events (cif, at);

-- Scam Shield engine clock per persona (E02): test tools shift "now" and pin the
-- hour warnings are judged at. Kept apart from `security_profiles` because the
-- app rewrites that row whole.
CREATE TABLE IF NOT EXISTS security_engine_state (
  cif TEXT PRIMARY KEY,
  clock_offset_ms INTEGER NOT NULL DEFAULT 0,
  alert_hour INTEGER CHECK (alert_hour IS NULL OR (alert_hour BETWEEN 0 AND 23)),
  -- E14: when the customer opened the account (BT1 «Trong 7 ngày đầu»); null = unknown.
  account_opened_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- Scam Shield engine (E04). Accounts on the fraud warning list — a MOCK of NHNN's
-- SIMO list / MSB's internal list (SIMO has no public API for the hackathon).
-- `bank` '' = any bank. Signal T2, scenario DH4, account lookup (UC 10).
CREATE TABLE IF NOT EXISTS warned_accounts (
  account TEXT NOT NULL,
  bank TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('danger', 'suspicious')),
  source TEXT NOT NULL DEFAULT 'mock' CHECK (source IN ('mock')),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (account, bank)
);
-- demo data: obviously fake numbers (9704 0000 …), seeded once; test tools can edit.
INSERT OR IGNORE INTO warned_accounts (account, bank, level, note) VALUES
  ('9704000000000001', 'VietinBank', 'danger', 'Giả danh công an / cơ quan thuế'),
  ('9704000000000002', 'BIDV', 'danger', 'Việc làm online, làm nhiệm vụ hưởng hoa hồng'),
  ('9704000000000003', 'Techcombank', 'danger', 'Đầu tư lợi nhuận cao'),
  ('9704000000000004', '', 'danger', 'Báo chuyển nhầm, nhờ chuyển trả sang tài khoản khác'),
  ('9704000000000005', 'Vietcombank', 'suspicious', 'Trúng thưởng, yêu cầu nộp phí nhận quà'),
  ('9704000000000006', '', 'suspicious', 'Giả danh người thân cấp cứu');

-- Scam Shield engine (E08). One row per warning the engine decided to show
-- (tooltip, banner, popup, full screen): the rule copy (spec wording), the agent
-- copy when the fraud agent enriched it, and what the customer chose. Also the
-- history the frequency rules ("1 lần/tháng", "không lặp trong 30 ngày") read.
CREATE TABLE IF NOT EXISTS interventions (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  scenario TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('green', 'yellow', 'red')),
  surface TEXT NOT NULL,
  target TEXT NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'shown', 'answered', 'expired')),
  context TEXT NOT NULL,
  copy_rule TEXT NOT NULL,
  copy_agent TEXT,
  agent_status TEXT NOT NULL DEFAULT 'none',
  countdown_sec INTEGER,
  created_at INTEGER NOT NULL,
  shown_at INTEGER,
  answered_at INTEGER,
  choice TEXT
);
CREATE INDEX IF NOT EXISTS idx_interventions_cif_status ON interventions (cif, status);

-- Scam Shield engine (E12). UC 10 (b) "giữ giao dịch khi có bất thường": a
-- transfer to a new recipient at or above the customer's threshold waits until
-- `release_at` (engine clock); the customer can cancel meanwhile.
CREATE TABLE IF NOT EXISTS transfer_holds (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('holding', 'cancelled', 'sent')),
  amount REAL NOT NULL,
  review TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  release_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfer_holds_cif ON transfer_holds (cif, status);

-- Scam Shield incident dossiers (E17). Attachments stay local and never reach an LLM.
CREATE TABLE IF NOT EXISTS fraud_cases (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  answers TEXT NOT NULL,
  dossier TEXT,
  attachments TEXT
);
CREATE INDEX IF NOT EXISTS idx_fraud_cases_cif ON fraud_cases (cif, opened_at);

-- Scam Shield engine (A10). One row per fraud-agent call: which action ran,
-- which tool names were used (never customer payloads), and whether the
-- customer agreed. `customer_decision` stays null until they choose.
CREATE TABLE IF NOT EXISTS ai_journal (
  id TEXT PRIMARY KEY,
  cif TEXT NOT NULL,
  at INTEGER NOT NULL,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  ref TEXT,
  data_used TEXT NOT NULL,
  output TEXT NOT NULL,
  customer_decision TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_journal_cif_at ON ai_journal (cif, at);

-- Kill switch for the Fraud agent (A10). No row means on. Env
-- FRAUD_AGENT_ENABLED=0/false/off forces off and the test-tools toggle cannot override it.
CREATE TABLE IF NOT EXISTS fraud_agent_switch (
  agent TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL
);
