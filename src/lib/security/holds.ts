import "server-only";

/**
 * UC 10 (b) withdraw protection: «giữ giao dịch khi có bất thường (UC 12):
 * người nhận mới cộng số tiền vượt ngưỡng KH đặt → giữ X phút, KH hủy được.
 * Chuyển cho người trong danh bạ tin cậy thì không bị giữ.» The rule decides the
 * hold; emergency contacts are told a transfer is held, never its amount.
 */

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { engineNow, readEngineClock } from "./clock";
import { recordEvent } from "./events";
import { readProfile } from "./profile-store";
import { buildTransferContext, type TransferReview } from "./signal-context";
import { computeSignals } from "./signals";

import { HOLD_MINUTES } from "./hold-rules";

export { HOLD_MINUTES };

export type HoldStatus = "holding" | "cancelled" | "sent";
export type Hold = { id: string; status: HoldStatus; amount: number; releaseAt: number; remainingMs: number; recipientName: string };

interface Row { id: string; cif: string; status: HoldStatus; amount: number; review: string; created_at: number; release_at: number }

function view(row: Row, now: number): Hold {
  let recipientName = "";
  try {
    recipientName = (JSON.parse(row.review) as TransferReview).recipientName;
  } catch {
    // keep empty
  }
  return { id: row.id, status: row.status, amount: row.amount, releaseAt: row.release_at, remainingMs: Math.max(0, row.release_at - now), recipientName };
}

/** Whether this transfer must wait: hold switched on, a new recipient (T1, never a trusted one), amount ≥ threshold. */
export function needsHold(cif: string, review: TransferReview): boolean {
  const profile = readProfile(cif);
  if (!profile.holdEnabled || review.amount < profile.holdThreshold) return false;
  // T1 is judged even when M-You warnings are off: the hold is its own opt-in.
  const signals = computeSignals({ ...buildTransferContext(cif, review), aiProtect: true });
  return signals.some(s => s.code === "T1");
}

/** Starts a hold when the rule says so; returns it, or null when the transfer may go now. */
export function requestHold(cif: string, review: TransferReview): Hold | null {
  if (!needsHold(cif, review)) return null;
  const now = engineNow(cif).getTime();
  // Test tools: "bỏ qua thời gian giữ" releases the hold at once.
  const releaseAt = readEngineClock(cif).skipHold ? now : now + HOLD_MINUTES * 60 * 1000;
  const row: Row = { id: randomUUID(), cif, status: "holding", amount: review.amount, review: JSON.stringify(review), created_at: now, release_at: releaseAt };
  getDb()
    .prepare("INSERT INTO transfer_holds (id, cif, status, amount, review, created_at, release_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, cif, row.status, row.amount, row.review, row.created_at, row.release_at);
  const contacts = readProfile(cif).emergencyContacts.filter(c => c.status === "active" || c.status === "removing");
  if (contacts.length) {
    // UC 10: the contact is told a transfer is held — no balance, no amount, no recipient.
    recordEvent(cif, "family_push", { message: `MSB đang tạm giữ một giao dịch chuyển tiền của người thân bạn trong ${HOLD_MINUTES} phút để kiểm tra (giả lập).`, scenario: "HOLD", contactIds: contacts.map(c => c.id) }, now);
  }
  return view(row, now);
}

/** Test tools: every open hold of this persona may be sent now. */
export function skipOpenHolds(cif: string): number {
  const now = engineNow(cif).getTime();
  return getDb().prepare("UPDATE transfer_holds SET release_at = ? WHERE cif = ? AND status = 'holding'").run(now, cif).changes;
}

export function getHold(cif: string, id: string): Hold | null {
  const row = getDb().prepare("SELECT * FROM transfer_holds WHERE cif = ? AND id = ?").get(cif, id) as Row | undefined;
  return row ? view(row, engineNow(cif).getTime()) : null;
}

/**
 * cancel: the customer drops the transfer. sent: it went through after the wait.
 * skip (test tools): the wait ends now. Returns the hold, or null when unknown or closed.
 */
export function updateHold(cif: string, id: string, action: "cancel" | "sent" | "skip"): Hold | null {
  const hold = getHold(cif, id);
  if (!hold || hold.status !== "holding") return null;
  const now = engineNow(cif).getTime();
  if (action === "sent" && hold.remainingMs > 0) return null;
  const db = getDb();
  if (action === "skip") db.prepare("UPDATE transfer_holds SET release_at = ? WHERE cif = ? AND id = ?").run(now, cif, id);
  else db.prepare("UPDATE transfer_holds SET status = ? WHERE cif = ? AND id = ?").run(action === "cancel" ? "cancelled" : "sent", cif, id);
  return getHold(cif, id);
}

/** Test tools: end every running hold of a persona now. */
export function skipAllHolds(cif: string): number {
  return getDb().prepare("UPDATE transfer_holds SET release_at = ? WHERE cif = ? AND status = 'holding'").run(engineNow(cif).getTime(), cif).changes;
}
