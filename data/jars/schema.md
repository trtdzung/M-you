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
- **Single-number model, single DERIVED balance:** a jar's `budget_limit` IS its
  allocation and ceiling. The jar has NO stored balance — its spendable
  `= max(0, remaining)` where `remaining = budget_limit − đã tiêu` is DERIVED
  from txn history (invariant #1), the SAME number the Overview envelope and the
  Chuyển-tiền source picker show. There is no separate allocation ledger and no
  `actual_amount` column (both retired): a jar-sourced transfer books a
  self-reported expense txn, which drops the derived `remaining` — nothing else.

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

Primary key `(cif, id)`.

**`role` (plan 260918-1120):** the `Jar.role` donor-waterfall field
(`buffer`/`spending`/`essential`/`goal`) is modelled in code (Phase 01) and threaded
through the engine onto `JarBudgetLine`/`JarSpendable` (Phase 03). Its DB `role`
column + seed lands in **Phase 04** (write path); until then a stored jar without one
is treated as `spending` by the engine. Inter-jar rebalances are NOT stored here —
they ride the `manual_transactions` table as `dieu-chinh-hu`-tagged txns (see
`data/schema.md`).

## Endpoints

All under `src/app/api/jars/`. `cif` travels in the query string for every
`:id`-scoped endpoint (including the categories sub-resource) — GET also
takes it as a query param, since it has no body at all; only the two
mutating collection-level endpoints (POST, PUT) take it in the JSON body.
No real auth — same trust model as every other endpoint in this prototype.

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/jars?cif=` | — | Read every jar for `cif`. |
| POST | `/api/jars` | `{cif, jar}` | Create a jar. |
| PUT | `/api/jars` | `{cif, jars}` | Replace the whole jar set (template apply / reset to default). |
| PATCH | `/api/jars/:id?cif=` | `{patch}` | Update one jar's fields. |
| DELETE | `/api/jars/:id?cif=` | — | Remove a jar (its categories move to "Khác"). |
| POST | `/api/jars/:id/categories?cif=` | `{categoryId}` | Move one category into this jar. |

Every endpoint (except GET) returns the full, freshly-read `JarConfig` —
callers never need a second round-trip to see the result of their own write.
POST returns `201`; every other success is `200`. Errors: `422` for a
missing/invalid `cif`, `jar`, `jars`, `patch`, `categoryId`, or a `PUT` body
with a duplicate jar `id`; `404` for `PATCH`/`DELETE`/categories-`POST`
against an unknown jar `id`.
