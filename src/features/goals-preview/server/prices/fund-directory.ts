import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { goalsV2Db } from "../db";

interface FundDirectoryItem {
  id: string;
  code: string;
  /** Nhãn hiển thị (Fmarket shortName), giống lượt đồng bộ. */
  label: string;
  fullName: string;
  productId: number;
  nav: { date: string; price: number }[];
}

function validRows(value: unknown): FundDirectoryItem[] {
  if (!Array.isArray(value)) return [];
  const rows = new Map<string, FundDirectoryItem>();
  for (const row of value) {
    if (!row || typeof row.code !== "string" || !row.code.trim() || row.id !== `fund-${row.code.trim()}` ||
        typeof row.fullName !== "string" || !row.fullName.trim() || !Number.isFinite(row.productId) || !Array.isArray(row.nav)) continue;
    const nav = row.nav.filter((point: unknown): point is FundDirectoryItem["nav"][number] => {
      if (!point || typeof point !== "object") return false;
      const p = point as { date?: unknown; price?: unknown };
      return typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
        Number.isFinite(Date.parse(p.date)) && typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0;
    });
    if (nav.length !== row.nav.length) throw new Error("Invalid fund snapshot NAV point");
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : row.code.trim();
    rows.set(row.id, { id: row.id, code: row.code.trim(), label, fullName: row.fullName.trim(), productId: row.productId, nav });
  }
  return [...rows.values()];
}

let seeded = false;
export function seedFundDirectory(): void {
  if (seeded) return;
  seeded = true;
  try {
    const db = goalsV2Db();
    if (db.prepare("SELECT 1 FROM gv2_instruments WHERE kind = 'external_fund' LIMIT 1").get()) return;
    const snapshot = JSON.parse(readFileSync(join(process.cwd(), "data/fund-directory.json"), "utf8"));
    if (snapshot.source !== "fmarket" || typeof snapshot.fetchedAt !== "string" || !Number.isFinite(Date.parse(snapshot.fetchedAt))) {
      throw new Error("Invalid fund snapshot metadata");
    }
    const rows = validRows(snapshot.items);
    if (rows.length < 30) throw new Error("Incomplete fund directory snapshot");
    const insertInstrument = db.prepare(`INSERT INTO gv2_instruments
      (id, kind, name, full_name, unit, fractional, source, external_ref, active, listed)
      VALUES (?, 'external_fund', ?, ?, 'CCQ', 1, 'fmarket', ?, 1, 1)`);
    const insertPrice = db.prepare(`INSERT INTO gv2_prices (instrument_id, price_date, price, raw_price, source, fetched_at)
      VALUES (?, ?, ?, ?, 'snapshot', ?)
      ON CONFLICT(instrument_id, price_date) DO NOTHING`);
    db.transaction(() => {
      if (db.prepare("SELECT 1 FROM gv2_instruments WHERE kind = 'external_fund' LIMIT 1").get()) return;
      for (const row of rows) {
        insertInstrument.run(row.id, row.label, row.fullName, String(row.productId));
        for (const point of row.nav) insertPrice.run(row.id, point.date, point.price, point.price, snapshot.fetchedAt);
      }
    })();
  } catch (error) {
    console.error("[goals-v2] fund directory seed failed", error);
  }
}
