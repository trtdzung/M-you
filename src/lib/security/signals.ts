// Scam Shield signal engine: T1–T8 of the "AI Agent Fraud" spec (section 1),
// each with the evidence it fired on. Pure: no React, no store, no DB — the
// server builds `SignalContext` (signal-context.ts), tests and the confirm
// screen can call this directly. Missing data never fires a signal.

import { normalizeText } from "@/components/settings/security/scan-message";
import type { Transaction } from "@/domain/models";
import { findBankByName } from "@/lib/transfer-banks";

export type SignalCode = "T1" | "T1b" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7a" | "T7b" | "T8";
/** Spec column "Độ mạnh": Trung bình / Mạnh / Phụ (only raises a level). */
export type SignalStrength = "medium" | "strong" | "aux";
export type SignalFacts = Record<string, number | string | boolean>;
export type Signal = { code: SignalCode; strength: SignalStrength; evidence: string; facts: SignalFacts };

export const SIGNAL_STRENGTH: Record<SignalCode, SignalStrength> = {
  T1: "medium", T1b: "medium", T2: "strong", T3: "medium", T4: "strong",
  T5: "strong", T6: "medium", T7a: "medium", T7b: "medium", T8: "aux",
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Reference thresholds from the spec ("cấu hình được"; constants here).
export const ALERT_RULES = {
  /** T3: amount at least this many times the largest outgoing payment in 90 days. */
  largestOutflowMultiple: 3,
  /** T3: amount at least this share of the source balance. */
  balanceShare: 0.5,
  historyDays: 90,
  /** T8: night window in Vietnam time, [start, end) wrapping midnight. */
  nightStartHour: 23,
  nightEndHour: 1,
  /** T4: savings settled / locked jar withdrawn within this window, at least this share of savings. */
  savingsWindowMs: 60 * MINUTE_MS,
  savingsShare: 0.5,
  /** T5: device login, password or phone change within this window. */
  accountChangeWindowMs: 24 * HOUR_MS,
  /** T6: rising transfers to one new recipient within this window; the spec's chain is 3+ orders. */
  chainWindowMs: 10 * MINUTE_MS,
  chainMinOrders: 3,
  /** T7a: this many credits from one never-seen account within the window. */
  baitWindowMs: 2 * DAY_MS,
  baitCount: 3,
  /** T7b: a credit this large (or this many times the usual credit) from a never-seen account. */
  largeCreditAmount: 10_000_000,
  largeCreditAvgMultiple: 3,
  /** T7b with an outgoing transfer: credits received within this window, share sent on. */
  largeCreditWindowMs: 24 * HOUR_MS,
  passOnShare: 0.8,
} as const;

// T8 memo keywords from the spec, matched on normalized (no-accent) text.
// "thue" alone is also "thuê" (rent), so common rent memos are excluded.
const RISK_WORDS: { label: string; pattern: RegExp }[] = [
  { label: "thuế", pattern: /\bthue\b(?!\s*(nha|phong|tro|xe|mat bang))/ },
  { label: "phạt", pattern: /\bphat\b/ },
  { label: "tài khoản an toàn", pattern: /\btai khoan an toan\b/ },
  { label: "nhiệm vụ", pattern: /\bnhiem vu\b/ },
  { label: "gấp", pattern: /\bgap\b/ },
];

/** Someone the customer already knows: a trusted contact or a past transfer recipient. */
export type KnownRecipient = { name: string; account: string; bank?: string };
export type AccountRef = { last4: string; bank: string; name: string };

export type SignalContext = {
  amount: number;
  isNewPayee: boolean;
  recipientName: string;
  /** Full or masked ("••• 1234"); only the last 4 digits are compared. */
  recipientAccount?: string;
  recipientBank?: string;
  memo: string | null;
  /** When the transfer is judged (engine alert time). */
  postedAt: Date;
  /** Engine "now" for time windows; defaults to `postedAt`. */
  now?: Date;
  aiProtect: boolean;
  trusted: KnownRecipient[];
  /** Past transfer recipients (T1/T1b). Omitted = none known. */
  pastRecipients?: KnownRecipient[];
  /** Largest outgoing payment in the last 90 days (T3); null/omitted = unknown. */
  largestOutflow90d?: number | null;
  /** Source account balance (T3); null/omitted = unknown. */
  balance?: number | null;
  // Engine-only facts below; omitted = unknown, so the signal stays off.
  /** T2: the recipient on the fraud warning list (mock SIMO). */
  warned?: { level: "danger" | "suspicious"; note?: string | null } | null;
  /** T4: savings settled early / locked jar withdrawn (ms, amount, savings total before). */
  savingsWithdrawals?: { at: number; amount: number; savingsBefore: number; kind: "fd" | "jar" }[];
  /** T5: account changes. */
  accountChanges?: { at: number; kind: "device_login" | "password_changed" | "phone_changed" }[];
  /** T6: earlier transfers out (not the one judged). */
  transfersOut?: { at: number; amount: number; recipient: AccountRef }[];
  /** T7a/T7b: money received. `kind` salary/income = regular income, never "từ người lạ". */
  credits?: { at: number; amount: number; sender: AccountRef; kind: "salary" | "income" | "transfer" }[];
  /** Accounts the customer dealt with before (history), as `last4|bankId` keys. */
  knownAccounts?: string[];
  /** T7b: usual amount received (average of past regular credits); null = unknown. */
  usualCredit?: number | null;
  /** T8: a screen-sharing app is on (simulated). */
  screenSharing?: boolean;
};

const VN_OFFSET_HOURS = 7;

const normalizeName = (name: string) => normalizeText(name).replace(/\s+/g, " ").trim();
const bankId = (bank: string | undefined) => findBankByName(bank)?.id ?? normalizeText(bank ?? "").trim();

/** Banks differ only when both are known banks; a missing or unrecognized name never counts as different. */
function sameBank(a: string | undefined, b: string | undefined): boolean {
  const left = findBankByName(a);
  const right = findBankByName(b);
  return !left || !right || left.id === right.id;
}

/** Last 4 digits of a full or masked account, or null when there are fewer. */
export function accountLastFour(account: string | undefined): string | null {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function accountKey(last4: string, bank: string | undefined): string {
  return `${last4}|${bankId(bank)}`;
}

/** Same normalized name, same last 4 account digits and (when both are known) same bank as a trusted contact. */
export function isTrustedRecipient(trusted: KnownRecipient[], name: string, account: string | undefined, bank?: string): boolean {
  const key = normalizeName(name);
  const digits = accountLastFour(account);
  return digits !== null && trusted.some(contact => normalizeName(contact.name) === key && accountLastFour(contact.account) === digits && sameBank(contact.bank, bank));
}

function vnHour(at: Date): number {
  return (at.getUTCHours() + VN_OFFSET_HOURS) % 24;
}

export function isNight(at: Date): boolean {
  const hour = vnHour(at);
  return hour >= ALERT_RULES.nightStartHour || hour < ALERT_RULES.nightEndHour;
}

export function riskWords(memo: string | null): string[] {
  if (!memo) return [];
  // Written with diacritics as "thuê" (rent) and not "thuế" (tax): not a tax word.
  const rentOnly = /thuê/i.test(memo) && !/thuế/i.test(memo);
  const text = normalizeText(memo).replace(/\s+/g, " ");
  return RISK_WORDS.filter(word => !(rentOnly && word.label === "thuế") && word.pattern.test(text)).map(word => word.label);
}

/**
 * Past recipients and the largest outgoing payment in the last 90 days, from the
 * customer's own history. Pending, reversed and internal transfers are skipped.
 */
export function transferHistory(transactions: Transaction[], now: Date): { pastRecipients: KnownRecipient[]; largestOutflow90d: number | null } {
  const since = now.getTime() - ALERT_RULES.historyDays * DAY_MS;
  const pastRecipients: KnownRecipient[] = [];
  let largest: number | null = null;
  for (const txn of transactions) {
    if (txn.direction !== "debit" || txn.status !== "posted" || txn.transferGroupId) continue;
    if (txn.type === "transfer" && txn.counterpartyAccountNumber) {
      pastRecipients.push({ name: txn.merchantName, account: txn.counterpartyAccountNumber, bank: txn.counterpartyBankName });
    }
    const at = Date.parse(txn.postedAt);
    if (at >= since && at <= now.getTime()) largest = Math.max(largest ?? 0, txn.amount);
  }
  return { pastRecipients, largestOutflow90d: largest };
}

const fmtVnd = (amount: number) => `${Math.round(amount).toLocaleString("vi-VN")}đ`;
const signal = (code: SignalCode, evidence: string, facts: SignalFacts = {}): Signal => ({ code, strength: SIGNAL_STRENGTH[code], evidence, facts });

/** T1 + T1b, the recipient checks shared with the old confirm-screen rule. */
function recipientSignals(ctx: SignalContext): Signal[] {
  const name = normalizeName(ctx.recipientName);
  const account = accountLastFour(ctx.recipientAccount);
  const known = [...ctx.trusted, ...(ctx.pastRecipients ?? [])];
  const sameName = known.filter(person => normalizeName(person.name) === name && accountLastFour(person.account) !== null);
  const sameAccount = sameName.some(person => accountLastFour(person.account) === account && sameBank(person.bank, ctx.recipientBank));
  const out: Signal[] = [];
  // T1b: same name as someone known, but a different account or bank.
  if (account !== null && sameName.length > 0 && !sameAccount) {
    out.push(signal("T1b", "Tên trùng người quen, khác số tài khoản hoặc ngân hàng", { knownMatches: sameName.length }));
  }
  // T1: never paid before and not a trusted contact.
  if (ctx.isNewPayee && !sameAccount) out.push(signal("T1", "Người nhận mới: chưa từng chuyển, không có trong danh bạ tin cậy"));
  return out;
}

function amountSignal(ctx: SignalContext): Signal | null {
  const vsLargest = ctx.largestOutflow90d != null && ctx.largestOutflow90d > 0 && ctx.amount >= ALERT_RULES.largestOutflowMultiple * ctx.largestOutflow90d;
  const vsBalance = ctx.balance != null && ctx.balance > 0 && ctx.amount >= ALERT_RULES.balanceShare * ctx.balance;
  if (!vsLargest && !vsBalance) return null;
  const parts = [
    vsLargest ? `gấp ${Math.floor((ctx.amount / ctx.largestOutflow90d!) * 10) / 10} lần giao dịch lớn nhất ${ALERT_RULES.historyDays} ngày` : null,
    vsBalance ? `${Math.round((ctx.amount / ctx.balance!) * 100)}% số dư` : null,
  ].filter(Boolean);
  return signal("T3", `Số tiền bất thường: ${parts.join(", ")}`, { vsLargest, vsBalance });
}

function savingsSignal(ctx: SignalContext, now: number): Signal | null {
  const recent = (ctx.savingsWithdrawals ?? []).filter(w => w.at <= now && now - w.at <= ALERT_RULES.savingsWindowMs);
  if (!recent.length) return null;
  const total = recent.reduce((sum, w) => sum + w.amount, 0);
  const savingsBefore = Math.max(...recent.map(w => w.savingsBefore));
  if (!(savingsBefore > 0) || total < ALERT_RULES.savingsShare * savingsBefore) return null;
  const minutes = Math.max(1, Math.round((now - Math.min(...recent.map(w => w.at))) / MINUTE_MS));
  return signal("T4", `Vừa rút ${fmtVnd(total)} tiết kiệm (${Math.round((total / savingsBefore) * 100)}% tiền tiết kiệm) ${minutes} phút trước`, { total, savingsBefore, minutesAgo: minutes });
}

const CHANGE_LABEL = { device_login: "đăng nhập thiết bị mới", password_changed: "đổi mật khẩu", phone_changed: "đổi số điện thoại" } as const;

function accountChangeSignal(ctx: SignalContext, now: number): Signal | null {
  const recent = (ctx.accountChanges ?? []).filter(c => c.at <= now && now - c.at <= ALERT_RULES.accountChangeWindowMs);
  if (!recent.length) return null;
  const kinds = [...new Set(recent.map(c => c.kind))];
  return signal("T5", `Trong 24 giờ qua tài khoản có ${kinds.map(k => CHANGE_LABEL[k]).join(", ")}`, { kinds: kinds.join(",") });
}

/**
 * T6: the judged transfer ends a chain of rising amounts to one NEW recipient
 * within 10 minutes. Fires from the 2nd order (the level table's Yellow uses
 * "lệnh thứ 2"); `facts.orderIndex` ≥ 3 is the spec's "từ 3 lệnh trở lên".
 */
function chainSignal(ctx: SignalContext, now: number, recipientIsNew: boolean): Signal | null {
  const last4 = accountLastFour(ctx.recipientAccount);
  if (!last4 || !recipientIsNew || !ctx.transfersOut) return null;
  const key = accountKey(last4, ctx.recipientBank);
  const toRecipient = ctx.transfersOut
    .filter(t => accountKey(t.recipient.last4, t.recipient.bank) === key && t.at <= now)
    .sort((a, b) => b.at - a.at);
  const chain: number[] = [ctx.amount];
  let lastAt = now;
  for (const t of toRecipient) {
    if (now - t.at > ALERT_RULES.chainWindowMs) break;
    if (t.amount >= chain[chain.length - 1]) break;
    chain.push(t.amount);
    lastAt = t.at;
  }
  if (chain.length < 2) return null;
  // A recipient paid before the chain started is not "mới".
  if (toRecipient.some(t => t.at < lastAt)) return null;
  const orderIndex = chain.length;
  return signal("T6", `Lần thứ ${orderIndex} chuyển cho cùng người nhận mới trong 10 phút, số tiền tăng dần`, { orderIndex });
}

function newCreditsFrom(ctx: SignalContext, now: number, windowMs: number) {
  const known = new Set(ctx.knownAccounts ?? []);
  return (ctx.credits ?? []).filter(c => c.at <= now && now - c.at <= windowMs && c.kind === "transfer" && !known.has(accountKey(c.sender.last4, c.sender.bank)));
}

function baitSignal(ctx: SignalContext, now: number): Signal | null {
  const bySender = new Map<string, { count: number; total: number; name: string }>();
  for (const c of newCreditsFrom(ctx, now, ALERT_RULES.baitWindowMs)) {
    const key = accountKey(c.sender.last4, c.sender.bank);
    const entry = bySender.get(key) ?? { count: 0, total: 0, name: c.sender.name };
    bySender.set(key, { count: entry.count + 1, total: entry.total + c.amount, name: entry.name });
  }
  const hit = [...bySender.entries()].find(([, v]) => v.count >= ALERT_RULES.baitCount);
  if (!hit) return null;
  const [key, v] = hit;
  return signal("T7a", `Trong 2 ngày nhận ${v.count} khoản (tổng ${fmtVnd(v.total)}) từ cùng một tài khoản chưa từng giao dịch`, { count: v.count, total: v.total, senderKey: key });
}

function largeCreditSignal(ctx: SignalContext, now: number): Signal | null {
  const threshold = Math.min(
    ALERT_RULES.largeCreditAmount,
    ctx.usualCredit != null && ctx.usualCredit > 0 ? ALERT_RULES.largeCreditAvgMultiple * ctx.usualCredit : Infinity,
  );
  const large = newCreditsFrom(ctx, now, ALERT_RULES.largeCreditWindowMs).filter(c => c.amount >= threshold);
  if (!large.length) return null;
  const received = Math.max(...large.map(c => c.amount));
  const shareOfRecent = received > 0 ? Math.round((ctx.amount / received) * 100) / 100 : 0;
  return signal("T7b", `Vừa nhận ${fmtVnd(received)} từ tài khoản chưa từng giao dịch, không phải lương hay thu nhập định kỳ`, { received, shareOfRecent });
}

function contextSignal(ctx: SignalContext): Signal | null {
  const night = isNight(ctx.postedAt);
  const words = riskWords(ctx.memo);
  const sharing = ctx.screenSharing === true;
  if (!night && !words.length && !sharing) return null;
  const parts = [
    night ? "giao dịch lúc nửa đêm (23:00–01:00)" : null,
    words.length ? `nội dung có chữ ${words.map(w => `"${w}"`).join(", ")}` : null,
    sharing ? "có ứng dụng đang chia sẻ màn hình" : null,
  ].filter(Boolean);
  return signal("T8", `Ngữ cảnh rủi ro: ${parts.join("; ")}`, { night, words: words.join(","), screenSharing: sharing });
}

/**
 * Every signal for one transfer about to be confirmed. M-You protection off →
 * none. A trusted contact keeps only T2 (a listed account is flagged anyway).
 */
export function computeSignals(ctx: SignalContext): Signal[] {
  if (!ctx.aiProtect) return [];
  const now = (ctx.now ?? ctx.postedAt).getTime();
  const out: Signal[] = [];
  if (ctx.warned) {
    out.push(signal("T2", `Tài khoản nhận nằm trong danh sách cảnh báo lừa đảo (${ctx.warned.level === "danger" ? "Nguy hiểm" : "Nghi ngờ"}, dữ liệu giả lập)`, { level: ctx.warned.level, note: ctx.warned.note ?? "" }));
  }
  if (isTrustedRecipient(ctx.trusted, ctx.recipientName, ctx.recipientAccount, ctx.recipientBank)) return out;
  const recipient = recipientSignals(ctx);
  out.push(...recipient);
  const extra = [
    amountSignal(ctx),
    savingsSignal(ctx, now),
    accountChangeSignal(ctx, now),
    chainSignal(ctx, now, recipient.some(s => s.code === "T1")),
    baitSignal(ctx, now),
    largeCreditSignal(ctx, now),
    contextSignal(ctx),
  ];
  for (const s of extra) if (s) out.push(s);
  return out;
}

/**
 * Money-in signals for the account itself (no transfer judged): BT4 (T7a) and
 * BT5 (T7b) when a credit arrives. Protection off → none.
 */
export function computeIncomingSignals(ctx: Pick<SignalContext, "aiProtect" | "credits" | "knownAccounts" | "usualCredit" | "now">): Signal[] {
  if (!ctx.aiProtect || !ctx.now) return [];
  const now = ctx.now.getTime();
  const base = { ...ctx, amount: 0 } as SignalContext;
  return [baitSignal(base, now), largeCreditSignal(base, now)].filter((s): s is Signal => s !== null);
}
