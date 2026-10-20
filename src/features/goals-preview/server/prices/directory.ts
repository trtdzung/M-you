import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { goalsV2Db } from "../db";

const URL = "https://api-finfo.vndirect.com.vn/v4/stocks?q=type:STOCK~status:listed&size=3000&fields=code,companyName,shortName,floor";
const TTL_MS = 7 * 24 * 60 * 60_000;
export interface StockDirectoryItem {
  code: string;
  companyName: string;
  shortName: string | null;
  floor: string | null;
}

function validRows(value: unknown): StockDirectoryItem[] {
  if (!Array.isArray(value)) return [];
  const rows = new Map<string, StockDirectoryItem>();
  for (const row of value) {
    if (!row || typeof row.code !== "string" || !row.code.trim() || typeof row.companyName !== "string" || !row.companyName.trim()) continue;
    const code = row.code.trim().toUpperCase();
    rows.set(code, { code, companyName: row.companyName.trim(), shortName: typeof row.shortName === "string" ? row.shortName.trim() : null, floor: typeof row.floor === "string" ? row.floor.trim() : null });
  }
  return [...rows.values()];
}

export async function fetchStockDirectory(): Promise<StockDirectoryItem[]> {
  const response = await fetch(URL, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Stock directory HTTP ${response.status}`);
  const body = await response.json();
  const rows = validRows(body.data);
  if (rows.length < 1000) throw new Error(`Stock directory has only ${rows.length} valid rows`);
  return rows;
}

function writeRows(rows: StockDirectoryItem[], source: string, syncedAt: string, replace: boolean): void {
  const db = goalsV2Db();
  const valid = validRows(rows);
  if (!valid.length) throw new Error("Empty stock directory");
  const upsert = db.prepare(`INSERT INTO gv2_stock_directory (code, company_name, short_name, floor, listed, source, synced_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(code) DO UPDATE SET company_name = excluded.company_name, short_name = excluded.short_name,
      floor = excluded.floor, listed = 1, source = excluded.source, synced_at = excluded.synced_at`);
  db.transaction(() => {
    if (replace) db.prepare("UPDATE gv2_stock_directory SET listed = 0").run();
    for (const row of valid) upsert.run(row.code, row.companyName, row.shortName, row.floor, source, syncedAt);
  })();
}

export function applyStockDirectory(rows: StockDirectoryItem[], source: string): void {
  writeRows(rows, source, new Date().toISOString(), true);
}

let seeded = false;
export function seedStockDirectory(): void {
  if (seeded) return;
  seeded = true;
  try {
    if (goalsV2Db().prepare("SELECT 1 FROM gv2_stock_directory LIMIT 1").get()) return;
    const snapshot = JSON.parse(readFileSync(join(process.cwd(), "data/stock-directory.json"), "utf8"));
    if (typeof snapshot.fetchedAt !== "string" || !Number.isFinite(Date.parse(snapshot.fetchedAt))) throw new Error("Invalid snapshot timestamp");
    const rows = validRows(snapshot.items);
    if (rows.length < 1000) throw new Error("Incomplete stock directory snapshot");
    writeRows(rows, "snapshot", snapshot.fetchedAt, true);
  } catch (error) {
    console.error("[goals-v2] stock directory seed failed", error);
  }
}

export function readStockDirectory(): StockDirectoryItem[] {
  seedStockDirectory();
  return goalsV2Db().prepare(`SELECT code, company_name AS companyName, short_name AS shortName, floor
    FROM gv2_stock_directory WHERE listed = 1 ORDER BY code`).all() as StockDirectoryItem[];
}

export function readStockDirectoryEntry(code: string): StockDirectoryItem | undefined {
  seedStockDirectory();
  return goalsV2Db().prepare(`SELECT code, company_name AS companyName, short_name AS shortName, floor
    FROM gv2_stock_directory WHERE code = ?`).get(code) as StockDirectoryItem | undefined;
}

const RETRY_MS = 60 * 60_000;
let running = false;
let lastAttempt = 0;
export function ensureStockDirectory({ force = false }: { force?: boolean } = {}): void {
  if (running) return;
  // Nguồn lỗi kéo dài: không thử lại ở mỗi lượt mở thị trường, chờ 1 giờ (trừ khi bấm Cập nhật lại).
  if (!force && Date.now() - lastAttempt < RETRY_MS) return;
  try {
    seedStockDirectory();
    const row = goalsV2Db().prepare("SELECT MAX(synced_at) AS syncedAt FROM gv2_stock_directory WHERE source = 'vndirect'").get() as { syncedAt: string | null };
    if (!force && row.syncedAt && Date.now() - Date.parse(row.syncedAt) < TTL_MS) return;
    running = true;
    lastAttempt = Date.now();
    void fetchStockDirectory().then(rows => applyStockDirectory(rows, "vndirect"))
      .catch(error => console.error("[goals-v2] stock directory sync failed", error))
      .finally(() => { running = false; });
  } catch (error) {
    console.error("[goals-v2] stock directory sync failed", error);
  }
}

export async function resolveFromSsi(code: string): Promise<StockDirectoryItem | undefined> {
  try {
    const response = await fetch(`https://iboard-query.ssi.com.vn/stock/${encodeURIComponent(code)}`, {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`SSI HTTP ${response.status}`);
    const { data } = await response.json();
    const rows = validRows([{ code, companyName: data?.companyNameVi, floor: data?.exchange }]);
    if (!rows.length) return undefined;
    writeRows(rows, "ssi", new Date().toISOString(), false);
    return rows[0];
  } catch (error) {
    console.error("[goals-v2] SSI directory lookup failed", error);
    return undefined;
  }
}
