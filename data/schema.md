# `data/pfm.sqlite3` — schema

SQLite database, committed to the repo pre-seeded (see `scripts/seed-db.mjs`).
Server-only (`src/lib/db.ts`, guarded with `server-only`) — never imported by
client code; the browser reaches this data only through the API routes under
`src/app/api/`, matching architectural invariant #4 (UI depends on provider
interfaces, never on the storage layer directly).

Run `npm run db:seed` to (re)create the file from scratch (drops and reseeds
every table — dev convenience, not a migration tool).

## `beneficiaries`

One row per saved recipient account, scoped by `cif` (the persona's
customer id — `CIF_0001`/`CIF_0002`/`CIF_0003` in this prototype, matching
the Agent backend's `user_id` convention).

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | `b_<cif>_<n>` for seed rows, `b_user_<timestamp>` for one created via "Lưu người nhận" |
| `cif` | TEXT | owner |
| `name` | TEXT | display name — the resolved account-holder name, or the nickname ("Tên gợi nhớ") when the user gave one |
| `account_number` | TEXT | full, never masked (product decision — Chuyển tiền never masks) |
| `bank_name` | TEXT | |
| `source` | TEXT | one of `msb` / `self_reported` / `estimated` / `mock` (architectural invariant #5 — provenance). Seed rows are `mock`; anything created via "Lưu người nhận" is `self_reported` (a hand-typed account number is never bank-verified) |
| `created_at` | TEXT | ISO timestamp |

Unique on `(cif, bank_name, account_number)` — saving an already-known
account again updates its `name` instead of creating a duplicate row.

## `accounts`

One row per bank account, scoped by `cif`. The CASA source of truth — a
confirmed transfer debits `balance` + `available_balance` here (via
`/api/accounts/debit`), so the money leaves for real and persists (mock
core-banking). Seeded per persona from the same formula as the transaction
fixtures (`buildPersonaAccounts` in `fixtures/generate.ts`), and lazily
re-seeded by `accounts-store.ts` if a persona has no rows yet.

| column | type | notes |
|---|---|---|
| `id` | TEXT PK¹ | `acc_<personaId>_<current\|savings\|credit>` — matches the `accountId` on the transaction fixtures |
| `cif` | TEXT PK¹ | owner |
| `type` | TEXT | `current` / `savings` / `credit_card` |
| `institution` | TEXT | e.g. "MSB" |
| `currency` | TEXT | e.g. "VND" |
| `balance` | REAL | ledger balance; a transfer decrements it |
| `available_balance` | REAL | spendable balance (CASA pool sums this over `current`); a transfer decrements it |
| `last_synced_at` | TEXT | ISO timestamp |
| `source` | TEXT | provenance (invariant #5); seed accounts are `msb` |
| `tier` | TEXT? | membership tier on the primary account (display-only), NULL otherwise |
| `masked_number` | TEXT | `•••• 1234` |
| `account_number` | TEXT | full |
| `sort_order` | INTEGER | display order (current account first) |

¹ Composite primary key `(cif, id)`.

## `transactions`

ALL transactions, scoped by `cif`, in ONE table told apart by `source`:

- **Bank-provided** rows (`source` = `mock` / `msb`) — the provider history,
  standing in for MSB core-banking. Served read-only by `GET /api/transactions`
  (`?cif=&from=&to=`, newest first); `mock-provider.ts` is the only caller and
  throws on a failed load so the UI shows its error state rather than an empty
  (silently-zero) history (invariant #6). Seeded lazily per persona by
  `transactions-store.ts` from the deterministic generator (`generateDataset` in
  `fixtures/generate.ts`) on first read; `npm run db:seed` deletes only these
  rows so the next read re-seeds them.
- **Self-reported** rows (`source = 'self_reported'`) — see
  [Self-reported rows](#transactions--self-reported-rows) below.

Provenance never mixes (invariant #5): every bank read/seed is scoped to
`source <> 'self_reported'`, every app write/delete to `source = 'self_reported'`.
A self-reported write whose id already belongs to a bank row is refused (409) —
the bank row is never overwritten.

| column | type | notes |
|---|---|---|
| `cif` | TEXT PK¹ | owner |
| `id` | TEXT PK¹ | `tx_<personaId>_<seq>` (bank) / `manual-<uuid>` (self-reported) |
| `source` | TEXT | `mock` \| `msb` \| `self_reported` (default `mock`); indexed with `cif, posted_at` |
| `posted_at` | TEXT | ISO 8601; indexed with `cif` for period filtering + ordering |
| `payload` | TEXT | full JSON `Transaction` |

Older DB files had a separate `manual_transactions` table: `src/lib/db.ts` (and
`scripts/seed-db.mjs`) add the `source` column, move those rows in as
`self_reported`, and drop the old table on connect.

Category labels are never written back to this table — they live in the
`transaction_corrections` overlay below.

## `categories`

The Vietnamese spending taxonomy as data (invariant #7) — **per persona (`cif`)
and writable**. Seeded lazily *per cif* by `categories-store.ts` from
`CATEGORIES` (`src/domain/models/categories.ts`) with `INSERT OR IGNORE`: a
category added in code appears on the next read for every persona, an existing
(possibly renamed) row is never clobbered. Sentinels (`unclassified`, `income`,
`dieu-chinh-hu`) are not categories and are never stored.

**Why per-cif.** `jars` is per-cif and every expense category belongs to exactly
one jar. With a global taxonomy, one persona creating a category would make it an
orphan for *every* persona, and each one's next `readJarConfig` would silently
heal it into their "Khác" jar — one user's edit rewriting everyone's jar config.

> ⚠️ **Not backward compatible.** The pre-Phase-02 table has no `cif` column and
> `CREATE TABLE IF NOT EXISTS` will not add one, so a stale `data/pfm.sqlite3`
> fails loudly on `idx_categories_cif`. That is deliberate — a silently empty
> taxonomy would 422 every jar write. Run `npm run db:seed` and commit the file.

| column | type | notes |
|---|---|---|
| `cif` | TEXT PK¹ | owner |
| `id` | TEXT PK¹ | preset id (`dining`…) or `c_<slug>` for a user-created one |
| `label` | TEXT | Vietnamese display name (NFC-trimmed, ≤ 40 chars) |
| `kind` | TEXT | `expense` \| `transfer` (a created category is always `expense`) |
| `fixed` | INTEGER | 1 = fixed cost — the cashflow split axis, **not** built-in-vs-custom |
| `custom` | INTEGER | 0 = bundled preset (rename/delete locked, 403), 1 = user-created |
| `archived_at` | TEXT | ISO 8601; NULL = active |
| `sort_order` | INTEGER | display order (a created category sorts last) |

Read by `GET /api/categories?cif=` (active only; `&includeArchived=1` adds
archived rows flagged `archived: true`) and written by
`POST /api/categories {cif, label, fixed?, jarId?}` /
`PATCH|DELETE /api/categories/:id?cif=`. Every write is ONE transaction covering
the category row **and** the jar-config write, and answers with the whole
resulting aggregate `{categories, jarConfig}`. Ids are generated server-side from
the label (slug whitelist `c_` + `[a-z0-9-]`) — a client-supplied `id` is ignored.

Three id sets are derived from this table (`categories-store.ts`):
`assignableCategoryIds` (active expense — pickers and the orphan-heal),
`knownExpenseCategoryIds` (active ∪ archived expense — the jar write guard) and
`knownCategoryIds` (everything — the `transaction_corrections` write guard).
Archiving is the escape hatch for a category still in use: it leaves the pickers
but keeps its jar membership and stays *known*, so no historical jar total moves.
Deleting is allowed only at usage 0 (else `409 {error, usedBy}`), and strips the
id from every jar of that cif in the same transaction.

Note: until Phase 03 of plan `260920-1019`, the client/engine/AI still render
from the bundled `CATEGORIES` constant — a category created through the API is
server-side truth but not yet visible in the UI.

## `transaction_corrections`

The per-transaction label overlay, scoped by `cif` — user corrections, AI /
memory / heuristic assignments, and the `hidden` flag. An overlay, never an edit
of the bank row in `transactions` (invariant #4). Read and written only by
`src/state/corrections.tsx` via `GET /api/corrections?cif=` and
`PATCH /api/corrections {cif, changes: {txnId: record | null}}` (one atomic
batch; `null` deletes). The store `normalize`s each record (provenance defaults,
#5), rejects the whole batch if a `categoryId` is not in THIS persona's
`categories` rows — `knownCategoryIds(cif)`, active ∪ archived (422) — and
never lets a non-user record overwrite a user one (user wins). Labels left in
browser `localStorage` (`msb-pfm.corrections[.<cif>]`) by earlier builds are
migrated up once on load. `npm run db:seed` clears this table with `transactions`.

| column | type | notes |
|---|---|---|
| `cif` | TEXT PK¹ | owner |
| `txn_id` | TEXT PK¹ | the labelled transaction's id |
| `payload` | TEXT | JSON `Correction` (`categoryId?`, `hidden?`, `origin`, `status`, `confidence?`) |
| `updated_at` | TEXT | ISO 8601 of the last write |

## `transactions` — self-reported rows

The `source = 'self_reported'` rows of `transactions`, scoped by `cif` — the records a user
enters via the ＋ FAB or that a confirmed transfer writes on its success card.
NOT money movement (invariant #3): every row is `source: "self_reported"`, forced
server-side so it can never look bank-verified (#5). Previously localStorage-only;
now a real table so records survive reloads, dev-server restarts, and devices.
Reached only through `/api/manual-transactions` (`src/lib/manual-txns-store.ts`);
the client hook (`src/state/manual-txns.tsx`) writes optimistically and persists
in the background, and imports any legacy localStorage rows once on first load.

Columns are those of `transactions` above; `id` is a client-generated
`manual-<uuid>`, and `payload` holds the full JSON `Transaction` (same
JSON-in-column pattern as `jars.category_ids`), letting the rich/evolving shape
persist without schema churn.

Writes are an upsert guarded by `source = 'self_reported'` (idempotent on a
replayed create; an id owned by a bank row → 409); PATCH is a read-modify-write over a whitelist
(`categoryId` / `type` / `transferPurpose` / `note` / `rebalance`), where a `null`
value CLEARS an optional field. No seed — a persona starts with zero self-reported
rows.

**Inter-jar rebalance txns (plan 260918-1120, Phase 03)** are self-reported rows — no
separate ledger. A rebalance is one row whose `payload` Transaction carries
`categoryId: "dieu-chinh-hu"` (a system category excluded from thu/chi + spend-by-
category, like `type:"transfer"`) plus a `rebalance` meta
`{ fromJarId, toJarId, triggerTxnId, origin: "auto"|"manual" }`. Because `payload`
is the full JSON Transaction, the meta persists with no column change; the engine
folds `Σ nhận − Σ cho` into each jar's `remaining`. The `rebalance` whitelist entry
above is what keeps a PATCH from silently dropping the meta. A rebalance never
touches `jars.budget_limit` — it moves the derived balance only, never the plan;
see "Two independent axes" in `data/jars/schema.md`.

## `jars`

See `data/jars/schema.md` — documented in its own file/folder rather than
here, since it's a separate, independently-evolving table.
