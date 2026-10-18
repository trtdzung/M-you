import "server-only";

/**
 * Simulated CC/RM handoff for UC12 emergency. The text is a local record only:
 * no outbound call, no model. A filed fraud case supplies the dossier; otherwise
 * the line is the SC1 lock time. Account balances are never read or invented.
 */

import { CASE_FIELDS } from "./case-types";
import { readCases } from "./case-store";
import { engineNow } from "./clock";
import type { SecurityEvent } from "./event-types";
import { eventsSince, recordEvent } from "./events";
import { readProfile } from "./profile-store";

const when = (at: number) => new Date(at).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

function clean(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.includes("data:image") || text.length > 180) return null;
  return text;
}

function filed(cif: string): { caseId: string | null; lines: string[] } {
  let caseId: string | null = null;
  for (const item of readCases(cif)) {
    caseId ??= item.id;
    const lines: string[] = [];
    CASE_FIELDS.forEach((field, index) => {
      const value = clean(item.dossier?.[field] || item.answers[index] || "");
      if (value) lines.push(`${field}: ${value}`);
    });
    if (lines.length) return { caseId: item.id, lines };
  }
  if (!caseId) {
    const opened = eventsSince(cif, 0, ["case_opened"]).at(-1) as SecurityEvent<"case_opened"> | undefined;
    caseId = opened?.payload.caseId ?? null;
  }
  return { caseId, lines: [] };
}

export type CcBrief = { summary: string; at: number; caseId: string | null };

/** One record per distinct summary, written only after the customer confirmed the lock. */
export function ensureCcBrief(cif: string): CcBrief | null {
  const profile = readProfile(cif);
  if (!profile.accountLocked) return null;
  const lockedAt = profile.accountLockedAt ?? (eventsSince(cif, 0, ["account_locked"]).at(-1)?.at ?? null);
  const file = filed(cif);
  const lock = lockedAt !== null ? `Đã khóa tạm tài khoản và thẻ lúc ${when(lockedAt)}.` : "Đã khóa tạm tài khoản và thẻ.";
  const dossier = file.lines.length ? `Hồ sơ tra soát: ${file.lines.join("; ")}.` : "Chưa có hồ sơ tra soát.";
  const summary = `Tóm tắt gửi tổng đài ưu tiên và RM (giả lập). ${lock} ${dossier}`.slice(0, 900);
  const prior = eventsSince(cif, 0, ["cc_brief"]).at(-1) as SecurityEvent<"cc_brief"> | undefined;
  if (prior?.payload.summary === summary) return { summary, at: prior.at, caseId: prior.payload.caseId };
  const event = recordEvent(cif, "cc_brief", { summary, caseId: file.caseId }, engineNow(cif).getTime());
  return { summary, at: event.at, caseId: file.caseId };
}
