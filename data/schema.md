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

## `jars`

See `data/jars/schema.md` — documented in its own file/folder rather than
here, since it's a separate, independently-evolving table.
