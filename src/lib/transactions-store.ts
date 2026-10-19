import "server-only";

/**
 * Read access to the `transactions` table (see `data/schema.md`) — the
 * bank-provided transaction history. Server only — imported by the route
 * handler under `src/app/api/transactions/`, never by client code
 * (architectural invariant #4).
 *
 * Rows are seeded per persona from the same deterministic generator the
 * accounts come from (`generateDataset`), lazily on first read of a persona
 * that has none — so a fresh/unseeded DB still works (mirrors `accounts-store`).
 * The table also holds self-reported rows (`source = 'self_reported'`, owned by
 * `manual-txns-store.ts`); every query here is scoped to `source <> 'self_reported'`
 * so bank history and self-reported records never mix (#5).
 */

import type { Transaction } from "@/domain/models";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { ANCHOR_TAG, generateDataset } from "@/providers/mock/fixtures/generate";
import { getDb } from "./db";

interface TxnRow {
  payload: string;
}

/** Parse a stored payload; a corrupt row is dropped, never fabricated. */
function toTransaction(row: TxnRow): Transaction | null {
  try {
    const txn = JSON.parse(row.payload) as Transaction;
    return txn && typeof txn.id === "string" ? txn : null;
  } catch {
    return null;
  }
}

/**
 * Seed a persona's history if the table has none for that `cif`. Idempotent
 * (`INSERT OR IGNORE` + a pre-count) so two concurrent first-reads can't
 * double-insert. An unknown `cif` (no persona) is a no-op → caller gets `[]`.
 */
function seedIfEmpty(cif: string): void {
  const db = getDb();
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ? AND source <> 'self_reported'").get(cif) as { n: number };
  if (n > 0) return;
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return;
  const insert = db.prepare(
    "INSERT OR IGNORE INTO transactions (cif, id, source, posted_at, payload) VALUES (@cif, @id, 'mock', @postedAt, @payload)",
  );
  const seed = db.transaction((txns: Transaction[]) => {
    for (const txn of txns) insert.run({ cif, id: txn.id, postedAt: txn.postedAt, payload: JSON.stringify(txn) });
  });
  seed(generateDataset(persona).transactions);
}

const toppedUp = new WeakMap<object, Set<string>>();

/**
 * Bổ sung các ngày còn thiếu cho persona đã seed từ mốc cũ: khi mốc "hôm nay" của fixture dịch tiến, chèn thêm giao dịch
 * sinh ra sau giao dịch mới nhất đang có (không đụng dòng cũ, nên nhãn và sổ hũ đang tham chiếu vẫn nguyên). Id và nhóm
 * chuyển khoản của dòng bổ sung có hậu tố `ANCHOR_TAG` để không trùng id cũ. Idempotent, chạy tối đa một lần mỗi cif mỗi DB.
 */
function topUpHistory(cif: string): void {
  const db = getDb();
  let done = toppedUp.get(db);
  if (!done) toppedUp.set(db, (done = new Set()));
  if (done.has(cif)) return;
  done.add(cif);
  // Mốc "đã có dữ liệu tới đây": bỏ qua thu nhập vì bộ sinh đặt "thu nhập thêm" ở ngày ngẫu nhiên có thể sau hôm nay.
  const { n, m } = db
    .prepare(
      "SELECT COUNT(*) AS n, MAX(posted_at) AS m FROM transactions WHERE cif = ? AND source <> 'self_reported' AND id LIKE 'tx\\_%' ESCAPE '\\' AND json_extract(payload, '$.type') <> 'income'",
    )
    .get(cif) as { n: number; m: string | null };
  if (!n || !m) return;
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return;
  // Thu nhập đã có trong tháng (cùng tên) thì không sinh thêm, tránh tính đôi lương / thu nhập thêm.
  const haveIncome = new Set(
    (
      db
        .prepare(
          "SELECT json_extract(payload, '$.merchantName') AS name, substr(posted_at, 1, 7) AS month FROM transactions WHERE cif = ? AND source <> 'self_reported' AND json_extract(payload, '$.type') = 'income'",
        )
        .all(cif) as { name: string; month: string }[]
    ).map((r) => `${r.name}|${r.month}`),
  );
  const fresh = generateDataset(persona)
    .transactions.filter((t) => t.postedAt > m)
    .filter((t) => t.type !== "income" || !haveIncome.has(`${t.merchantName}|${t.postedAt.slice(0, 7)}`));
  if (fresh.length === 0) return;
  const freshIds = new Set(fresh.map((t) => t.id));
  const tag = (id: string) => `${id}_${ANCHOR_TAG}`;
  const insert = db.prepare(
    "INSERT OR IGNORE INTO transactions (cif, id, source, posted_at, payload) VALUES (@cif, @id, 'mock', @postedAt, @payload)",
  );
  const run = db.transaction((txns: Transaction[]) => {
    for (const txn of txns) {
      // Hoàn tiền tham chiếu giao dịch ngoài phần bổ sung thì bỏ (không để id treo).
      if (txn.relatedTransactionId && !freshIds.has(txn.relatedTransactionId)) continue;
      const next: Transaction = {
        ...txn,
        id: tag(txn.id),
        ...(txn.transferGroupId ? { transferGroupId: tag(txn.transferGroupId) } : {}),
        ...(txn.relatedTransactionId ? { relatedTransactionId: tag(txn.relatedTransactionId) } : {}),
      };
      insert.run({ cif, id: next.id, postedAt: next.postedAt, payload: JSON.stringify(next) });
    }
  });
  run(fresh);
}

/**
 * The persona's transactions, newest first, optionally bounded by `postedAt`
 * (inclusive, same string comparison the provider query has always used).
 */
export function readTransactions(cif: string, range: { from?: string; to?: string } = {}): Transaction[] {
  seedIfEmpty(cif);
  topUpHistory(cif);
  const rows = getDb()
    .prepare(
      `SELECT payload FROM transactions
        WHERE cif = @cif AND source <> 'self_reported'
          AND (@from IS NULL OR posted_at >= @from)
          AND (@to IS NULL OR posted_at <= @to)
        ORDER BY posted_at DESC, id DESC`,
    )
    .all({ cif, from: range.from ?? null, to: range.to ?? null }) as TxnRow[];
  return rows.map(toTransaction).filter((t): t is Transaction => t !== null);
}
