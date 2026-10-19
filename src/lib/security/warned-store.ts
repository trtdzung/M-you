import "server-only";

/**
 * The fraud warning list (`warned_accounts`): a MOCK of NHNN's SIMO list and
 * MSB's internal list — SIMO has no public API for the hackathon. Feeds signal
 * T2, scenario DH4 and the account lookup in Hub Security (UC 10).
 */

import { getDb } from "@/lib/db";
import { findBankByName } from "@/lib/transfer-banks";

export type WarnLevel = "danger" | "suspicious";
export type LookupLevel = WarnLevel | "none";
export type WarnedAccount = { account: string; bank: string; level: WarnLevel; source: "mock"; note: string };
export type LookupResult = { level: LookupLevel; source: "mock"; note: string | null };

// UC 10: "Kết quả 3 mức: Nguy hiểm / Nghi ngờ / Chưa thấy dấu hiệu. Không bao giờ nói "an toàn"."
export const LOOKUP_LABELS: Record<LookupLevel, string> = {
  danger: "Nguy hiểm",
  suspicious: "Nghi ngờ",
  none: "Chưa thấy dấu hiệu",
};

const digits = (account: string) => account.replace(/\D/g, "");

/** Same bank when both are known banks with the same id, or the names match ignoring case. */
function sameBank(listed: string, asked: string): boolean {
  const a = findBankByName(listed);
  const b = findBankByName(asked);
  if (a && b) return a.id === b.id;
  return listed.trim().toLocaleLowerCase("vi") === asked.trim().toLocaleLowerCase("vi");
}

export function listWarned(): WarnedAccount[] {
  return getDb().prepare("SELECT account, bank, level, source, note FROM warned_accounts ORDER BY account, bank").all() as WarnedAccount[];
}

/**
 * Checks one account (full number; masked numbers cannot be checked). A row with
 * no bank matches any bank; with an unknown bank asked, any row of that number matches.
 */
export function lookupAccount(account: string, bank?: string): LookupResult {
  const number = digits(account);
  if (number.length < 6) return { level: "none", source: "mock", note: null };
  const rows = (getDb().prepare("SELECT account, bank, level, source, note FROM warned_accounts WHERE account = ?").all(number) as WarnedAccount[])
    .filter(row => !row.bank || !bank?.trim() || sameBank(row.bank, bank));
  const hit = rows.find(row => row.level === "danger") ?? rows[0];
  return hit ? { level: hit.level, source: "mock", note: hit.note || null } : { level: "none", source: "mock", note: null };
}

/** Test tools: add or replace a listed account. */
export function addWarned(input: { account: string; bank?: string; level: WarnLevel; note?: string }): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO warned_accounts (account, bank, level, source, note) VALUES (?, ?, ?, 'mock', ?)")
    .run(digits(input.account), input.bank?.trim() ?? "", input.level, input.note?.trim() ?? "");
}

/** Test tools: remove a listed account (every bank when `bank` is omitted). */
export function removeWarned(account: string, bank?: string): void {
  const db = getDb();
  if (bank === undefined) db.prepare("DELETE FROM warned_accounts WHERE account = ?").run(digits(account));
  else db.prepare("DELETE FROM warned_accounts WHERE account = ? AND bank = ?").run(digits(account), bank.trim());
}
