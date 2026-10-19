import "server-only";

/**
 * Dựng `WorldState` của Mục tiêu cho một khách từ DB: mục tiêu / tài sản / khoản
 * vay / meta ở các bảng `gv2_*`; tài khoản mục tiêu từ `gv2_goal_accounts` + số dư
 * thật ở bảng `accounts`; giao dịch từ bảng `transactions` chung (mọi nguồn, gồm cả
 * `self_reported`) của các tài khoản mục tiêu, làm giàu bằng `gv2_txn_kinds`.
 * Chỉ đọc.
 */

import type { Transaction } from "@/domain/models";
import type { WorldState } from "../model/state";
import {
  TXN_DIRECTION,
  type Asset,
  type Goal,
  type GoalAccount,
  type GoalTxn,
  type GoalTxnKind,
  type ISODate,
  type Loan,
  type RiskProfile,
} from "../model/types";
import { goalToday } from "./clock";
import { buildCustomerProfile } from "./customer-context";
import { goalsV2Db } from "./db";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const GOAL_ACCOUNT_PREFIX = "goalacc-";
/** Lệnh trích thất bại không có bút toán, chỉ có dòng `gv2_txn_kinds` với id này. */
export const SO_FAIL_PREFIX = "sofail-";

const GOAL_TXN_KINDS: ReadonlySet<string> = new Set(Object.keys(TXN_DIRECTION));
const RISK_PROFILES: ReadonlySet<string> = new Set(["conservative", "balanced", "growth"]);

export interface GoalMeta {
  seq: number;
  processedThrough: ISODate | null;
  fundPriceShiftPct: number;
  riskProfile: RiskProfile | null;
  /** Khách đã trả lời bộ câu hỏi khẩu vị (`risk_profile_asked_at` có giá trị). */
  riskProfileAsked: boolean;
}

interface MetaRow {
  seq: number;
  processed_through: string | null;
  fund_price_shift_pct: number;
  risk_profile: string | null;
  risk_profile_asked_at: string | null;
}

interface GoalAccountRow {
  account_id: string;
  goal_id: string;
  number: string;
  name: string;
  interest_rate_pa: number;
  opened_at: string;
  closed_at: string | null;
}

interface KindRow {
  txn_id: string;
  goal_id: string;
  kind: string;
  note: string | null;
}

/** Id tài khoản mục tiêu trong bảng `accounts` (STANDARD 4.1). */
export function goalAccountId(goalId: string): string {
  return `${GOAL_ACCOUNT_PREFIX}${goalId}`;
}

/** Ngày VN của một `postedAt`. */
export function vnDateOf(iso: string): ISODate {
  return new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Id dòng lệnh trích thất bại: `sofail-<ngày>-<số tiền>-<duy nhất>` — bảng
 * `gv2_txn_kinds` không có cột ngày / số tiền nên mang chúng trong id.
 */
export function soFailId(date: ISODate, amount: number, unique: string): string {
  return `${SO_FAIL_PREFIX}${date}-${Math.round(amount)}-${unique}`;
}

function parseSoFail(txnId: string): { date: ISODate; amount: number } | null {
  const match = /^sofail-(\d{4}-\d{2}-\d{2})-(\d+)-/.exec(txnId);
  return match ? { date: match[1], amount: Number(match[2]) } : null;
}

function parseJson<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export function readGoalMeta(cif: string): GoalMeta {
  const row = goalsV2Db()
    .prepare("SELECT seq, processed_through, fund_price_shift_pct, risk_profile, risk_profile_asked_at FROM gv2_meta WHERE cif = ?")
    .get(cif) as MetaRow | undefined;
  return {
    seq: row?.seq ?? 0,
    processedThrough: row?.processed_through ?? null,
    fundPriceShiftPct: row?.fund_price_shift_pct ?? 0,
    riskProfile: row?.risk_profile && RISK_PROFILES.has(row.risk_profile) ? (row.risk_profile as RiskProfile) : null,
    riskProfileAsked: row?.risk_profile_asked_at != null,
  };
}

/** Giao dịch thật trên các tài khoản mục tiêu → `GoalTxn` (cũ → mới, có số dư sau giao dịch). */
function readGoalTxns(cif: string, accountGoal: Map<string, string>): GoalTxn[] {
  const db = goalsV2Db();
  const kinds = new Map<string, KindRow>();
  const failed: GoalTxn[] = [];
  for (const row of db.prepare("SELECT txn_id, goal_id, kind, note FROM gv2_txn_kinds WHERE cif = ?").all(cif) as KindRow[]) {
    if (row.kind === "standing_order_failed") {
      const parsed = parseSoFail(row.txn_id);
      const goalAccount = [...accountGoal.entries()].find(([, goalId]) => goalId === row.goal_id)?.[0];
      if (parsed && goalAccount) {
        failed.push({
          id: row.txn_id,
          goalId: row.goal_id,
          accountId: goalAccount,
          kind: "standing_order_failed",
          amount: parsed.amount,
          date: parsed.date,
          note: row.note ?? "",
        });
      }
      continue;
    }
    kinds.set(row.txn_id, row);
  }

  const rows = db
    .prepare(
      `SELECT payload FROM transactions
        WHERE cif = ? AND json_extract(payload, '$.accountId') LIKE '${GOAL_ACCOUNT_PREFIX}%'
        ORDER BY posted_at ASC, id ASC`,
    )
    .all(cif) as { payload: string }[];

  const posted: { txn: GoalTxn; postedAt: string }[] = [];
  for (const row of rows) {
    const t = parseJson<Transaction>(row.payload);
    if (!t || typeof t.id !== "string") continue;
    const goalId = accountGoal.get(t.accountId);
    if (!goalId) continue;
    const enriched = kinds.get(t.id);
    const kind: GoalTxnKind =
      enriched && GOAL_TXN_KINDS.has(enriched.kind)
        ? (enriched.kind as GoalTxnKind)
        : t.direction === "credit"
          ? "deposit"
          : "withdraw";
    posted.push({
      postedAt: t.postedAt,
      txn: {
        id: t.id,
        goalId,
        accountId: t.accountId,
        kind,
        amount: Math.round(t.amount),
        date: vnDateOf(t.postedAt),
        note: enriched?.note ?? t.merchantName ?? t.note ?? "",
      },
    });
  }

  // Số dư sau giao dịch: cộng dồn theo từng tài khoản.
  const running = new Map<string, number>();
  for (const { txn } of posted) {
    const balance = (running.get(txn.accountId) ?? 0) + TXN_DIRECTION[txn.kind] * txn.amount;
    running.set(txn.accountId, balance);
    txn.balanceAfter = balance;
  }

  // Lệnh trích thất bại xếp vào đúng ngày (09:00 giờ VN như việc tự chạy).
  const all = [
    ...posted,
    ...failed.map((txn) => ({ txn, postedAt: `${txn.date}T02:00:00.000Z` })),
  ];
  all.sort((a, b) => (a.postedAt < b.postedAt ? -1 : a.postedAt > b.postedAt ? 1 : a.txn.id < b.txn.id ? -1 : 1));
  return all.map((x) => x.txn);
}

/** World của khách từ DB. `clock.today` = `goalToday(cif)`. */
export function loadWorld(cif: string, options: { profileAsOf?: ISODate } = {}): WorldState {
  const db = goalsV2Db();
  const today = goalToday(cif);
  const meta = readGoalMeta(cif);
  // Hồ sơ khách đọc `accounts` / `transactions` (tự seed persona lần đầu) — gọi trước khi đọc số dư.
  const customer = { ...buildCustomerProfile(cif, options.profileAsOf ?? today, meta.riskProfile ?? "conservative"), riskProfileAsked: meta.riskProfileAsked };

  const goals = (db.prepare("SELECT payload FROM gv2_goals WHERE cif = ? ORDER BY sort_order ASC, id ASC").all(cif) as { payload: string }[])
    .map((r) => parseJson<Goal>(r.payload))
    .filter((g): g is Goal => g !== null);
  const assets = (db.prepare("SELECT payload FROM gv2_assets WHERE cif = ? ORDER BY rowid ASC").all(cif) as { payload: string }[])
    .map((r) => parseJson<Asset>(r.payload))
    .filter((a): a is Asset => a !== null);
  const loans = (db.prepare("SELECT payload FROM gv2_loans WHERE cif = ? ORDER BY rowid ASC").all(cif) as { payload: string }[])
    .map((r) => parseJson<Loan>(r.payload))
    .filter((l): l is Loan => l !== null);

  const accountRows = db
    .prepare(
      "SELECT account_id, goal_id, number, name, interest_rate_pa, opened_at, closed_at FROM gv2_goal_accounts WHERE cif = ? ORDER BY opened_at ASC, account_id ASC",
    )
    .all(cif) as GoalAccountRow[];
  const balanceOf = db.prepare("SELECT balance FROM accounts WHERE cif = ? AND id = ?");
  const accounts: GoalAccount[] = accountRows.map((r) => {
    const closed = r.closed_at !== null;
    const row = closed ? undefined : (balanceOf.get(cif, r.account_id) as { balance: number } | undefined);
    return {
      id: r.account_id,
      goalId: r.goal_id,
      number: r.number,
      name: r.name,
      balance: closed ? 0 : Math.round(row?.balance ?? 0),
      interestRatePa: r.interest_rate_pa,
      openedAt: r.opened_at,
      status: closed ? "closed" : "open",
    };
  });

  const txns = readGoalTxns(cif, new Map(accountRows.map((r) => [r.account_id, r.goal_id])));

  return {
    version: 1,
    scenarioId: "real",
    customer,
    goals,
    accounts,
    txns,
    assets,
    loans,
    clock: { today },
    market: { fundPriceShiftPct: meta.fundPriceShiftPct },
    seq: meta.seq,
  };
}
