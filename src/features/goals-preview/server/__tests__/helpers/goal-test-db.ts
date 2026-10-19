/**
 * Fixture DB tạm cho test goal-backend: chép `data/pfm.sqlite3` bằng backup
 * readonly (không ghi file gốc), gắn mock `getDb`, đánh dấu đồng bộ giá hôm nay
 * để `ensurePricesFresh` không gọi mạng.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ensureGoalV2Tables } from "../../db";

export const CIF = "CIF_0001";

export type GoalFixture = {
  db: Database.Database;
  dir: string;
  close: () => void;
};

/** Ngày VN hôm nay (UTC+7) — khớp `vnDate` trong nguồn giá. */
export function vnToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Chép DB sản phẩm sang thư mục tạm; không đụng file gốc. */
export async function openGoalFixtureDb(): Promise<GoalFixture> {
  const dir = mkdtempSync(join(tmpdir(), "gv2-vitest-"));
  const dest = join(dir, "pfm.sqlite3");
  const sourcePath = join(process.cwd(), "data", "pfm.sqlite3");
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(dest);
  } finally {
    source.close();
  }
  const db = new Database(dest);
  db.pragma("journal_mode = WAL");
  ensureGoalV2Tables(db);
  markPriceSyncFresh(db);
  return {
    db,
    dir,
    close: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Chèn lượt sync `ok` cho ngày VN hôm nay để khóa không kích hoạt mạng. */
export function markPriceSyncFresh(db: Database.Database, syncDate = vnToday()): void {
  db.prepare(
    "INSERT INTO gv2_price_sync (sync_date, started_at, finished_at, status) VALUES (?, ?, ?, 'ok')",
  ).run(syncDate, new Date().toISOString(), new Date().toISOString());
}

export function goalInput(name = "Test goal") {
  return {
    name,
    template: "other" as const,
    targetAmount: 500_000_000,
    targetDate: "2028-12-31",
    flexibility: "date_flexible" as const,
  };
}

/** Bản ghi giao dịch tối thiểu đủ kiểu `Transaction` cho test. */
export function txnBase(over: Record<string, unknown> = {}) {
  return {
    currency: "VND" as const,
    merchantNormalizedName: "review",
    status: "posted" as const,
    source: "self_reported" as const,
    isRecurring: false,
    userEdited: false,
    ...over,
  };
}

export function balancesOf(cif: string, readAccounts: (cif: string) => { id: string; balance: number }[]) {
  return Object.fromEntries(readAccounts(cif).map((a) => [a.id, a.balance]));
}

export function totalMoney(cif: string, readAccounts: (cif: string) => { balance: number }[]) {
  return readAccounts(cif).reduce((s, a) => s + a.balance, 0);
}
