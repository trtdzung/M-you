import "server-only";

import type { MarketInstrument, MarketKind } from "../../data/market";
import { goalsV2Db } from "../db";
import { stockCompanyNameFallback } from "./sources";

/** Một lượt đồng bộ `running` bắt đầu trong khoảng này được coi là còn chạy. */
export const SYNC_LOCK_MS = 2 * 60_000;

interface InstrumentRow {
  id: string;
  kind: string;
  name: string;
  full_name: string | null;
  unit: string;
  fractional: number;
}

interface PriceRow {
  instrument_id: string;
  price_date: string;
  price: number;
}

/**
 * Chuẩn hoá label: quỹ cũ có thể còn `name` = tên dài Fmarket (chưa sync lại).
 * Khi đó tách mã từ id (`fund-XXX`) và đưa tên dài sang fullName.
 */
function normalizeLabels(row: InstrumentRow): { name: string; fullName?: string } {
  let name = row.name;
  let fullName = row.full_name?.trim() || undefined;
  if (row.kind === "external_fund" && !fullName && row.id.startsWith("fund-")) {
    const code = row.id.slice("fund-".length);
    if (code && name !== code) {
      fullName = name;
      name = code;
    }
  }
  if (row.kind === "stock" && !fullName) {
    fullName = stockCompanyNameFallback(name);
  }
  return { name, fullName };
}

/** Công cụ đang hoạt động kèm chuỗi giá tăng dần theo ngày (chỉ công cụ có ít nhất 1 giá). */
export function readMarketInstruments(): MarketInstrument[] {
  const db = goalsV2Db();
  const instruments = db
    .prepare("SELECT id, kind, name, full_name, unit, fractional FROM gv2_instruments WHERE active = 1 ORDER BY id")
    .all() as InstrumentRow[];
  const prices = db
    .prepare(
      `SELECT p.instrument_id, p.price_date, p.price FROM gv2_prices p
         JOIN gv2_instruments i ON i.id = p.instrument_id AND i.active = 1
        ORDER BY p.instrument_id, p.price_date ASC`,
    )
    .all() as PriceRow[];
  const byId = new Map<string, { date: string; price: number }[]>();
  for (const p of prices) {
    const list = byId.get(p.instrument_id) ?? [];
    list.push({ date: p.price_date, price: p.price });
    byId.set(p.instrument_id, list);
  }
  const out: MarketInstrument[] = [];
  for (const i of instruments) {
    const priceSeries = byId.get(i.id);
    if (!priceSeries || priceSeries.length === 0) continue;
    const { name, fullName } = normalizeLabels(i);
    out.push({
      id: i.id,
      kind: i.kind as MarketKind,
      name,
      ...(fullName ? { fullName } : {}),
      unit: i.unit,
      fractional: i.fractional === 1,
      priceSeries,
    });
  }
  return out;
}

/** `asOf` = ngày giá mới nhất đã lưu; `refreshing` = đang có lượt đồng bộ chạy. */
export function readPriceStatus(): { asOf: string | null; refreshing: boolean } {
  const db = goalsV2Db();
  const asOf = (db.prepare("SELECT MAX(price_date) AS d FROM gv2_prices").get() as { d: string | null }).d;
  const since = new Date(Date.now() - SYNC_LOCK_MS).toISOString();
  const running = db
    .prepare("SELECT 1 AS x FROM gv2_price_sync WHERE status = 'running' AND started_at > ? LIMIT 1")
    .get(since);
  return { asOf, refreshing: running !== undefined };
}
