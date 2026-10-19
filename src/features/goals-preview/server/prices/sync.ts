import "server-only";

import { goalsV2Db } from "../db";
import {
  FETCH_FROM_FIRST,
  fetchFunds,
  fetchGold,
  fetchStocks,
  vnDate,
  type SinceFn,
  type SourcePoint,
  type SourceResult,
} from "./sources";
import { readPriceStatus, SYNC_LOCK_MS } from "./repo";

/** Lệch quá ngưỡng này so với giá gần nhất đã lưu → bỏ điểm. */
const MAX_JUMP = 0.3;
const RECENT_DAYS = 10;

function startRun(db: ReturnType<typeof goalsV2Db>, syncDate: string): number {
  const info = db
    .prepare("INSERT INTO gv2_price_sync (sync_date, started_at, status) VALUES (?, ?, 'running')")
    .run(syncDate, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

/**
 * Nếu chưa có lượt thành công cho ngày VN hôm nay (hoặc `force`) và không có lượt đang chạy trong 2 phút
 * qua → ghi dòng `running` và chạy đồng bộ ở nền. Không bao giờ chờ.
 */
function trigger(force: boolean): { refreshing: boolean; asOf: string | null } {
  try {
    const db = goalsV2Db();
    const today = vnDate(new Date());
    const locked = db
      .prepare("SELECT 1 AS x FROM gv2_price_sync WHERE status = 'running' AND started_at > ? LIMIT 1")
      .get(new Date(Date.now() - SYNC_LOCK_MS).toISOString());
    if (!locked) {
      const fresh = force
        ? undefined
        : db
            .prepare("SELECT 1 AS x FROM gv2_price_sync WHERE sync_date = ? AND status IN ('ok','partial') LIMIT 1")
            .get(today);
      if (!fresh) {
        const runId = startRun(db, today);
        void runSync(runId).catch((e) => console.error("[goals-v2] price sync failed", e));
      }
    }
  } catch (e) {
    console.error("[goals-v2] ensurePricesFresh failed", e);
  }
  try {
    return readPriceStatus();
  } catch {
    return { refreshing: false, asOf: null };
  }
}

/** Gọi khi đọc thị trường: trả ngay, đồng bộ (nếu cần) chạy ở nền. */
export function ensurePricesFresh(): { refreshing: boolean; asOf: string | null } {
  return trigger(false);
}

/** Nút "Cập nhật lại": như trên nhưng bỏ điều kiện "đã có hôm nay" (vẫn giữ khoá 2 phút). */
export function refreshPricesNow(): { refreshing: boolean; asOf: string | null } {
  return trigger(true);
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Đồng bộ: các nguồn chạy song song, ghi giá + công cụ, đóng dòng `running`. */
async function runSync(runId: number): Promise<void> {
  const db = goalsV2Db();
  const now = new Date();
  const detail: Record<string, unknown> = {};
  let status: "ok" | "partial" | "failed" = "failed";
  try {
    const known = new Set(
      (db.prepare("SELECT DISTINCT instrument_id AS id FROM gv2_prices").all() as { id: string }[]).map((r) => r.id),
    );
    const recentFrom = addDays(vnDate(now), -RECENT_DAYS);
    const since: SinceFn = (id) => (known.has(id) ? recentFrom : FETCH_FROM_FIRST);

    const settled = await Promise.allSettled([fetchGold(now), fetchStocks(now, since), fetchFunds(now, since)]);
    const names = ["gold", "stocks", "funds"];
    const results: SourceResult[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") results.push(s.value);
      else detail[names[i]] = { errors: [String(s.reason)] };
    });

    const latest = db.prepare(
      "SELECT price FROM gv2_prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 1",
    );
    const upsertInstrument = db.prepare(
      `INSERT INTO gv2_instruments (id, kind, name, unit, fractional, source, external_ref, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, unit = excluded.unit,
         fractional = excluded.fractional, source = excluded.source, external_ref = excluded.external_ref, active = 1`,
    );
    const upsertPrice = db.prepare(
      `INSERT INTO gv2_prices (instrument_id, price_date, price, raw_price, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(instrument_id, price_date) DO UPDATE SET price = excluded.price, raw_price = excluded.raw_price,
         source = excluded.source, fetched_at = excluded.fetched_at`,
    );
    const fetchedAt = now.toISOString();
    let failedSources = 0;

    for (const r of results) {
      const dropped: string[] = [];
      // Gom theo mã, sắp theo ngày, để so độ lệch với điểm hợp lệ liền trước.
      const byId = new Map<string, SourcePoint[]>();
      for (const p of r.points) {
        if (!(p.price > 0)) continue;
        const list = byId.get(p.instrumentId) ?? [];
        list.push(p);
        byId.set(p.instrumentId, list);
      }
      let written = 0;
      db.transaction(() => {
        for (const i of r.instruments) {
          upsertInstrument.run(i.id, i.kind, i.name, i.unit, i.fractional ? 1 : 0, i.source, i.externalRef);
        }
        for (const [id, list] of byId) {
          list.sort((a, b) => a.priceDate.localeCompare(b.priceDate));
          let ref = (latest.get(id) as { price: number } | undefined)?.price ?? null;
          for (const p of list) {
            if (ref !== null && Math.abs(p.price - ref) / ref > MAX_JUMP) {
              dropped.push(`${id}@${p.priceDate}: ${p.price} lệch >30% so với ${ref}`);
              continue;
            }
            upsertPrice.run(id, p.priceDate, p.price, p.rawPrice, p.source, fetchedAt);
            ref = p.price;
            written++;
          }
        }
      })();
      if (r.points.length === 0) failedSources++;
      detail[r.source] = { written, errors: r.errors, ...(dropped.length ? { dropped } : {}) };
    }
    const anyIssue = Object.values(detail).some((d) => {
      const o = d as { errors?: string[]; dropped?: string[] };
      return (o.errors?.length ?? 0) > 0 || (o.dropped?.length ?? 0) > 0;
    });
    if (failedSources >= results.length || results.length === 0) status = "failed";
    else status = anyIssue ? "partial" : "ok";
  } catch (e) {
    detail.fatal = String(e);
    status = "failed";
  } finally {
    try {
      db.prepare("UPDATE gv2_price_sync SET finished_at = ?, status = ?, detail = ? WHERE id = ?").run(
        new Date().toISOString(),
        status,
        JSON.stringify(detail),
        runId,
      );
    } catch (e) {
      console.error("[goals-v2] cannot close price sync row", e);
    }
  }
}
