/**
 * Tier B — draft-only transfer tools (Level 3, EPIC-13).
 *
 * SAFETY CONTRACT (CLAUDE.md #2/#3): these are DELIBERATELY NOT registered in
 * `toolSchemas()` — the LLM can never call them. The action pipeline invokes
 * them directly, server-side, with fields parsed deterministically from the
 * user's text. There is NO execute/confirm/submit/authenticate path here and no
 * OTP/credential handling. Recipients resolve ONLY to real existing records
 * (saved beneficiaries / transaction history / a number the user explicitly
 * typed) — a recipient account number is NEVER fabricated.
 */

import type {
  RecipientSource,
  TransferDraft,
  TransferRiskFlag,
} from "@/domain/models";
import { CURRENCY_VND } from "@/domain/models";
import type { AiContext } from "@/ai/server/load-financials";

/** Names of the Tier B tools — asserted absent from the LLM schema in tests. */
export const TIER_B_TOOL_NAMES = ["findRecipient", "prepareTransferDraft"] as const;

export interface ResolvedRecipient {
  /** Reference to the real source record (beneficiary id / txn id / typed:acct). */
  recipientRef: string;
  recipientName: string;
  recipientAccountMasked: string;
  recipientSource: RecipientSource;
  /** True when the recipient is not a saved beneficiary (fraud heuristic input). */
  isNewPayee: boolean;
}

export type FindRecipientResult =
  | { status: "resolved"; recipient: ResolvedRecipient }
  | { status: "ambiguous"; candidates: { name: string; masked: string }[] }
  | { status: "not_found" };

/** Mask an account number for display: keep only the last 4 digits. */
export function maskAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  return `****${digits.slice(-4)}`;
}

/** Lowercase + strip Vietnamese diacritics for lenient name matching. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

/** A bare account number the user typed (8–19 digits, spaces/dots ignored). */
function asAccountNumber(query: string): string | null {
  const digits = query.replace(/[\s.]/g, "");
  return /^\d{8,19}$/.test(digits) ? digits : null;
}

/**
 * Resolve a transfer recipient from real records only. Order: saved beneficiaries
 * → transaction history → a validated user-typed account number. Ambiguity or a
 * miss is reported honestly — nothing is invented.
 */
export function findRecipient(query: string, ctx: AiContext): FindRecipientResult {
  const raw = (query ?? "").trim();
  if (!raw) return { status: "not_found" };

  const beneficiaries = ctx.beneficiaries ?? [];
  const typed = asAccountNumber(raw);

  // 1. Exact account-number match wins (saved → history → user_typed).
  if (typed) {
    const savedByAcct = beneficiaries.find((b) => b.accountNumber.replace(/\D/g, "") === typed);
    if (savedByAcct) {
      return resolved(savedByAcct.id, savedByAcct.name, savedByAcct.accountNumber, "saved_beneficiary", false);
    }
    const histByAcct = historyPayees(ctx).find((h) => h.account.replace(/\D/g, "") === typed);
    if (histByAcct) {
      return resolved(histByAcct.ref, histByAcct.name, histByAcct.account, "transaction_history", true);
    }
    // A real number the user explicitly provided — accepted, flagged new payee.
    return resolved(`typed:${typed}`, "Người nhận mới", typed, "user_typed", true);
  }

  // 2. Name match against saved beneficiaries.
  const q = fold(raw);
  const savedMatches = beneficiaries.filter((b) => fold(b.name).includes(q) || q.includes(fold(b.name)));
  if (savedMatches.length === 1) {
    const b = savedMatches[0];
    return resolved(b.id, b.name, b.accountNumber, "saved_beneficiary", false);
  }
  if (savedMatches.length > 1) {
    return { status: "ambiguous", candidates: savedMatches.map((b) => ({ name: b.name, masked: maskAccount(b.accountNumber) })) };
  }

  // 3. Name match against transaction-history payees (real counterparty accounts).
  const hist = historyPayees(ctx);
  const histMatches = hist.filter((h) => fold(h.name).includes(q) || q.includes(fold(h.name)));
  const distinct = dedupeByAccount(histMatches);
  if (distinct.length === 1) {
    const h = distinct[0];
    return resolved(h.ref, h.name, h.account, "transaction_history", true);
  }
  if (distinct.length > 1) {
    return { status: "ambiguous", candidates: distinct.map((h) => ({ name: h.name, masked: maskAccount(h.account) })) };
  }

  return { status: "not_found" };
}

function resolved(
  ref: string,
  name: string,
  account: string,
  source: RecipientSource,
  isNewPayee: boolean,
): FindRecipientResult {
  return {
    status: "resolved",
    recipient: {
      recipientRef: ref,
      recipientName: name,
      recipientAccountMasked: maskAccount(account),
      recipientSource: source,
      isNewPayee,
    },
  };
}

interface HistoryPayee {
  ref: string;
  name: string;
  account: string;
}

/** External P2P counterparties from real transaction history (with an account). */
function historyPayees(ctx: AiContext): HistoryPayee[] {
  return ctx.raw.transactions
    .filter((t) => t.type === "transfer" && typeof t.counterpartyAccountNumber === "string")
    .map((t) => ({ ref: t.id, name: t.merchantName, account: t.counterpartyAccountNumber as string }));
}

function dedupeByAccount(payees: HistoryPayee[]): HistoryPayee[] {
  const seen = new Set<string>();
  const out: HistoryPayee[] = [];
  for (const p of payees) {
    const key = p.account.replace(/\D/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// prepareTransferDraft (Tier B) — assembles a validated, draft-only object.
// ---------------------------------------------------------------------------

export interface PrepareDraftInput {
  recipient: ResolvedRecipient;
  amount: number;
  memo: string | null;
  sourceAccountId: string;
  riskFlags: TransferRiskFlag[];
  thresholdHit: boolean;
  requiresReconfirm: boolean;
  requestId: string;
  now?: Date;
}

export type PrepareDraftResult =
  | { ok: true; draft: TransferDraft }
  | { ok: false; error: string };

/**
 * Build a validated `TransferDraft`. This NEVER executes, confirms, or
 * authenticates anything — it only assembles a reviewable object. Missing/invalid
 * fields fail with a reason rather than being guessed or fabricated.
 */
export function prepareTransferDraft(input: PrepareDraftInput, ctx: AiContext): PrepareDraftResult {
  if (!input.recipient || !input.recipient.recipientRef) {
    return { ok: false, error: "Chưa xác định được người nhận." };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Số tiền không hợp lệ." };
  }
  const sourceAccount = ctx.raw.accounts.find((a) => a.id === input.sourceAccountId);
  if (!sourceAccount) {
    return { ok: false, error: "Không tìm thấy tài khoản nguồn." };
  }

  const draft: TransferDraft = {
    id: `draft_${input.requestId}`,
    status: "draft",
    recipientRef: input.recipient.recipientRef,
    recipientName: input.recipient.recipientName,
    recipientAccountMasked: input.recipient.recipientAccountMasked,
    recipientSource: input.recipient.recipientSource,
    sourceAccountId: sourceAccount.id,
    amount: input.amount,
    currency: CURRENCY_VND,
    memo: input.memo,
    riskFlags: input.riskFlags,
    thresholdHit: input.thresholdHit,
    requiresReconfirm: input.requiresReconfirm,
    createdBy: "agent",
    createdAt: (input.now ?? new Date()).toISOString(),
    requestId: input.requestId,
  };
  return { ok: true, draft };
}
