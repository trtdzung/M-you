import "server-only";

/**
 * Lõi server của Mục tiêu: đọc world thật (kèm xử lý bù các ngày đã trôi qua) và
 * áp một thao tác của khách bằng CHÍNH reducer / engine thuần của client, rồi ghi
 * bút toán thật (`applyPostings`). Không bao giờ chờ đồng bộ giá.
 */

import { hydrateMarket, type MarketInstrument } from "../data/market";
import { advanceTime } from "../engine/advance";
import { daysBetween } from "../engine/dates";
import type { PreviewState, WorldState } from "../model/state";
import type { PreviewAction } from "../store/actions";
import { previewReducer } from "../store/reducer";
import { engineNow } from "@/lib/security/clock";
import { advanceGoalClock } from "./clock";
import { goalsV2Db } from "./db";
import { applyPostings, GoalInsufficientFundsError } from "./postings";
import { readMarketInstruments, readPriceStatus } from "./prices/repo";
import { ensurePricesFresh } from "./prices/sync";
import { loadWorld, readGoalMeta } from "./world-repo";

export interface GoalsV2Market {
  instruments: MarketInstrument[];
  asOf: string | null;
  refreshing: boolean;
}

export interface GoalsV2Snapshot {
  world: WorldState;
  market: GoalsV2Market;
}

export type GoalsV2ActionResult = ({ ok: true } & GoalsV2Snapshot) | ({ ok: false; error: string } & GoalsV2Snapshot);

/** Thao tác trên dữ liệu giả — server từ chối (STANDARD 4.6). */
const REJECTED_TYPES: ReadonlySet<string> = new Set(["loadScenario", "reset", "setCustomer", "hydrate"]);

function isRejectedType(type: string): boolean {
  return REJECTED_TYPES.has(type) || type.startsWith("nav/") || type.startsWith("toast/");
}

/** Nạp danh mục thị trường (giá thật đã lưu) cho engine; đồng bộ giá chạy nền nếu cần. */
function loadMarket(): GoalsV2Market {
  const instruments = readMarketInstruments();
  hydrateMarket(instruments);
  ensurePricesFresh();
  return { instruments, ...readPriceStatus() };
}

/** World của khách; nếu "hôm nay" đã qua `processed_through` thì chạy engine bù các ngày đó và ghi bút toán. */
function loadAndCatchUp(cif: string): WorldState {
  const world = loadWorld(cif);
  const { processedThrough } = readGoalMeta(cif);
  if (processedThrough === null) {
    // Lần đầu: chỉ đánh dấu mốc, không chạy bù quá khứ.
    applyPostings(cif, world, structuredClone(world), null);
    return loadWorld(cif);
  }
  const days = daysBetween(processedThrough, world.clock.today);
  if (days <= 0) return world;
  const start: WorldState = { ...world, clock: { today: processedThrough } };
  const { state: next } = advanceTime(start, days);
  try {
    applyPostings(cif, start, next, null);
  } catch (err) {
    // Không làm hỏng việc đọc: trả world chưa xử lý bù, lần đọc sau thử lại.
    console.error("[goals-v2] catch-up postings failed", err);
    return world;
  }
  return loadWorld(cif);
}

export function getWorld(cif: string): GoalsV2Snapshot {
  const market = loadMarket();
  return { world: loadAndCatchUp(cif), market };
}

function toPreviewState(world: WorldState): PreviewState {
  return {
    ...world,
    dismissedSuggestionIds: [],
    nav: { stack: [{ key: "s0-GoalList", screen: "GoalList", params: {} }] },
    toasts: [],
  };
}

function toWorld(state: PreviewState): WorldState {
  const { version, scenarioId, customer, goals, accounts, txns, assets, loans, clock, market, seq } = state;
  return { version, scenarioId, customer, goals, accounts, txns, assets, loans, clock, market, seq };
}

/** Reducer không đổi phần dữ liệu (cùng tham chiếu) — từ chối hoặc không làm gì. `seq` bỏ qua: toast lỗi cũng tăng nó. */
function worldUnchanged(prev: PreviewState, next: PreviewState): boolean {
  return (
    prev.customer === next.customer &&
    prev.goals === next.goals &&
    prev.accounts === next.accounts &&
    prev.txns === next.txns &&
    prev.assets === next.assets &&
    prev.loans === next.loans &&
    prev.clock === next.clock &&
    prev.market === next.market
  );
}

function logAction(cif: string, requestId: string, actionType: string): void {
  goalsV2Db()
    .prepare("INSERT OR IGNORE INTO gv2_action_log (cif, request_id, action_type, created_at) VALUES (?, ?, ?, ?)")
    .run(cif, requestId, actionType, new Date().toISOString());
}

export function applyAction(cif: string, requestId: string, action: PreviewAction): GoalsV2ActionResult {
  if (isRejectedType(action.type)) {
    return { ok: false, error: "Thao tác này không dùng được với dữ liệu thật.", ...getWorld(cif) };
  }
  const db = goalsV2Db();
  const seen = db.prepare("SELECT 1 AS x FROM gv2_action_log WHERE cif = ? AND request_id = ?").get(cif, requestId);
  if (seen) return { ok: true, ...getWorld(cif) };

  if (action.type === "advanceTime") {
    db.transaction(() => {
      advanceGoalClock(cif, action.days);
      logAction(cif, requestId, action.type);
    })();
    return { ok: true, ...getWorld(cif) };
  }

  const { world } = getWorld(cif);
  const state = toPreviewState(world);
  const next = previewReducer(state, action);
  if (worldUnchanged(state, next)) {
    const last = next.toasts[next.toasts.length - 1];
    if (next.toasts.length > state.toasts.length && last?.tone === "error") {
      return { ok: false, error: last.message, ...getWorld(cif) };
    }
    logAction(cif, requestId, action.type);
    return { ok: true, ...getWorld(cif) };
  }

  try {
    db.transaction(() => {
      applyPostings(cif, world, toWorld(next), engineNow(cif).toISOString());
      logAction(cif, requestId, action.type);
    })();
  } catch (err) {
    if (err instanceof GoalInsufficientFundsError) return { ok: false, error: err.message, ...getWorld(cif) };
    throw err;
  }
  return { ok: true, ...getWorld(cif) };
}
