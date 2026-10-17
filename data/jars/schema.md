# `jars` table — schema

Part of `data/pfm.sqlite3` (DDL lives in `data/schema.sql`, alongside every
other table — SQLite doesn't support per-table schema files, so only the
*documentation* for jars gets its own folder here). Server-only access via
`src/lib/jars-store.ts`; the browser reaches this table only through
`/api/jars*` (architectural invariant #4).

One row per spending jar ("hũ"), scoped by `cif` (the persona's customer id —
`CIF_0001`/`CIF_0002`/`CIF_0003` in this prototype). Every business invariant
is enforced by the route handlers via `src/domain/jar-rules.ts` — the table
itself holds no constraints beyond its primary key and `NOT NULL` columns:

- **One category belongs to exactly one jar.** Enforced on every write
  (`stripCategories`/`healOrphanCategories`/`dedupeCategories`).
- **Two numbers per jar, two axes (plan `260923-jar-limit-vs-balance-split`):**
  - **Hạn mức (limit)** = `budget_limit`, the monthly PLAN. The verdict is
    `overLimit = đã chi tháng này > budget_limit`; it resets every month and is
    only ever changed by the user editing the jar (`PATCH /api/jars/:id`, or a
    template `PUT`). An inter-jar transfer never touches it.
  - **Số dư (balance)** = the money in the jar, a running STOCK that carries over
    months. It is NOT stored — the engine derives it (invariant #1,
    `src/domain/engine/jar-balance.ts`):
    `balance = Σ deposit − Σ withdraw − Σ đã chi[created_at, asOf] + Σ (nhận − cho)[created_at, asOf]`
    over the jar's `jar_ledger` rows and txn history since its anchor
    (`created_at`). No ledger row yet, or a month before the anchor → balance
    unknown ("Chưa có số dư"), never 0. It may be negative (spent past the money
    in the jar → auto-fund / "Cần bù thủ công").
  - Spendable (transfer source, pool) = `max(0, balance)`; "Chờ phân bổ" = CASA −
    Σ spendable. A jar-sourced transfer books a self-reported expense txn, which
    lowers both "đã chi" and the balance — nothing else.

| column | type | notes |
|---|---|---|
| `id` | TEXT | jar id (e.g. `food`, `essentials`) |
| `cif` | TEXT | owner |
| `label` | TEXT | display name |
| `category_ids` | TEXT | JSON array of expense-category ids this jar covers |
| `budget_limit` | REAL, nullable | "Đã set" — the monthly target. `NULL` = chưa đặt (never 0) |
| `color` | TEXT, nullable | presentation override |
| `icon` | TEXT, nullable | presentation override |
| `sort_order` | INTEGER | display order |
| `created_at` | TEXT, nullable | ISO anchor of the running balance; server-owned (kept for an existing id across a rewrite, stamped with `transferNow()` for a new one). Nullable only for the `ALTER TABLE` migration, which backfills it |

Primary key `(cif, id)`.

Deposits/withdrawals live in `jar_ledger` (see `data/schema.md`); inter-jar
rebalances are NOT stored here either —
they ride the `transactions` table as `self_reported`, `dieu-chinh-hu`-tagged txns (see
`data/schema.md`).

## Endpoints

Jar CRUD lives under `src/app/api/jars/`; the jar ledger has its own sibling
route `src/app/api/jar-ledger/` (plan 260923, D4). `cif` travels in the query
string for every `:id`-scoped endpoint (including the categories sub-resource)
— GET also takes it as a query param, since it has no body at all; the
collection-level mutating endpoints (POST, PUT, and `POST /api/jar-ledger`)
take it in the JSON body. No real auth — same trust model as every other
endpoint in this prototype.

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/jars?cif=` | — | Read every jar for `cif` (+ its `ledger`). |
| POST | `/api/jars` | `{cif, jar, balance}` | Create a jar. `jar.budgetLimit` (monthly limit) and `balance` (opening deposit) are REQUIRED whole VND in `[0, 10^12]`; jar row + opening ledger row (`is_opening = 1`, also for 0) in one transaction. CASA cap on Σ spendable with the opening deposit folded in. |
| PUT | `/api/jars` | `{cif, jars}` | Replace the whole jar set (template apply / reset to default). Writes NO ledger rows (a new id has balance `null`); ledger rows of dropped ids are deleted. |
| PATCH | `/api/jars/:id?cif=` | `{patch}` | Update one jar's fields. A limit edit is never CASA-capped (≤ 10^12 only); the cap runs only when `categoryIds` change. |
| DELETE | `/api/jars/:id?cif=` | — | Remove a jar (its categories move to "Khác"; its ledger rows and rebalance legs go in the same transaction). |
| POST | `/api/jars/:id/categories?cif=` | `{categoryId}` | Move one category into this jar. |
| POST | `/api/jar-ledger` | `{cif, entries: [{jarId, kind: "deposit"\|"withdraw", amount}]}` | Atomic batch of 1–50 deposits/withdrawals (amount whole VND in `(0, 10^12]`, Σ ≤ 10^12). All-or-nothing; CASA cap checked once on the whole batch. |

The batch `PATCH /api/jars` was removed (plan 260923, Red Team #10) — Next
answers 405.

Every endpoint (except GET) returns the full, freshly-read `JarConfig` —
callers never need a second round-trip to see the result of their own write.
`POST /api/jars` and `POST /api/jar-ledger` return `201`; every other success
is `200`. Errors: `422` for a missing/invalid `cif`, `jar`, `balance`, `jars`,
`patch`, `categoryId`, `entries`, a `PUT` body with a duplicate jar `id`, a
ledger entry for a jar with no DB row (the synthetic "Khác" — `jar not
persisted`), a withdraw over a jar's balance or on an unfunded jar (`over
balance` + `maxWithdraw`, `null` when unknown), or a write raising Σ spendable
past CASA (`over CASA cap` + `overBy`); `404` for `PATCH`/`DELETE`/
categories-`POST` against an unknown jar `id`, and for a ledger entry's unknown
`jarId`.
