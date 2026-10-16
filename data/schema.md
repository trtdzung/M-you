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

## Not yet in this database

Spending jars ("hũ") still live in browser `localStorage`
(`src/providers/mock/mock-provider.ts`) — moving them into this database,
plus real create/edit/delete endpoints for them, is tracked as pending work
in `todo.md` (kept out of this pass on purpose — jars were explicitly
descoped from this round).
