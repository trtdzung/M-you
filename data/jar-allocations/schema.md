# `jar_allocations` table — schema

Part of `data/pfm.sqlite3` (DDL lives in `data/schema.sql`, alongside every
other table). Server-only access via `src/lib/jar-allocations-store.ts`; the
browser reaches this table only through `/api/jar-allocations` (architectural
invariant #4).

One row per **envelope allocation** ("phân bổ thu nhập vào hũ"), scoped by `cif`
(the persona's customer id — `CIF_0001`/`CIF_0002`/`CIF_0003` in this
prototype). Each row says: part of income transaction `txn_id` was allocated
into jar `jar_id` for `amount` VND. Append-only bookkeeping of money the user
already received — it moves no real money and never touches a transfer/OTP
(invariant #3).

Keying to a concrete `txn_id` is what makes "N giao dịch chưa vào hũ" an EXACT
count over the ledger (an income txn is "chưa chia hết" when `Σ allocations <
amount`), never a proxy over a pooled sum.

The funded "còn lại trong hũ" the Overview widget shows is **DERIVED** by the
engine (`src/domain/engine/jar-envelope.ts`) from these rows plus jar-budget
spend — it is NOT the stored `jars.actual_amount`, which remains the Chuyển-tiền
spendable balance and is untouched by allocations.

| column | type | notes |
|---|---|---|
| `id` | TEXT | allocation id (`crypto.randomUUID()`) |
| `cif` | TEXT | owner |
| `txn_id` | TEXT | the income transaction this allocation draws from |
| `jar_id` | TEXT | destination jar; an id no longer in config folds into "Khác" (engine) |
| `amount` | REAL | VND allocated (> 0; a NaN/negative/zero row is rejected at the guard) |
| `source` | TEXT | always `self_reported` (a user-entered allocation, never bank-verified) |
| `created_at` | TEXT | ISO 8601 timestamp |

Primary key `id`; indexed by `cif`.

## Endpoints

All under `src/app/api/jar-allocations/`. No real auth — same trust model as
every other endpoint in this prototype.

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/jar-allocations?cif=` | — | Read every allocation for `cif`, oldest first. |
| POST | `/api/jar-allocations` | `{cif, allocations:[{txnId,jarId,amount}]}` | Append allocations atomically; returns the full updated list (`201`). |

There is no dedicated DELETE endpoint. `reassignJar(cif, fromJarId, toJarId)`
(same store module) is called internally by `DELETE /api/jars/:id` to repoint
a deleted jar's rows at `"khac"` — storage-side tidiness only; the engine's
own orphan-`jarId` fold (see `data/jars/schema.md`) is what actually
guarantees no allocated money is ever lost.

Errors: `422` for a missing/invalid `cif` or an `allocations` list that is
absent, empty, or contains any malformed element (negative/NaN/zero amount or
empty `txnId`/`jarId`) — a single bad element rejects the whole batch, so a
partial write can never happen.

## Not validated server-side (by design)

The route does **not** verify that `txn_id` is a real, in-scope, income
transaction — transactions are provider data, not rows in this DB, so the route
cannot see them. The engine is the authority (invariant #1): it honours an
allocation only when its `txnId` is an income transaction in the current period,
so an allocation to a fabricated / non-income / other-persona txn is simply
**inert** — it neither reduces "chờ phân bổ" nor credits a jar.
