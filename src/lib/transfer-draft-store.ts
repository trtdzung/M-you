/**
 * Session-scoped hand-off store for a transfer draft (Red Team #11). The draft's
 * fields (recipient name, amount, memo, source label) MUST NOT travel in the URL
 * query string — they are PII/financial data. The DraftCard writes the draft here
 * keyed by its id; `/transfer-confirm` reads it back by id. `sessionStorage` keeps
 * it on the device, cleared when the tab closes. No account NUMBER is ever stored
 * (only the masked display), and nothing here executes a transfer.
 */

export interface StoredTransferDraft {
  id: string;
  name: string;
  accountMasked: string;
  /** Full (unmasked) account number — only used by the post-confirm success receipt (Chuyển tiền never masks). */
  accountNumber?: string;
  /** Recipient's bank, for the success receipt's bank logo. */
  recipientBankName?: string;
  amount: number;
  memo: string | null;
  sourceLabel: string;
  /** The CASA account the money actually leaves — `/transfer-confirm` debits it on EVERY transfer (jar money physically lives in this account). Absent on legacy drafts → confirm falls back to the single `current` account. */
  sourceAccountId?: string;
  /** Set when the chosen source was a jar — `/transfer-confirm` books the spend into this jar's first category (dropping its derived `remaining`) alongside the `sourceAccountId` debit. */
  sourceJarId?: string;
  recipientSource?: "saved_beneficiary" | "transaction_history" | "user_typed";
  riskFlags?: import("@/domain/models").TransferRiskFlag[];
  /**
   * A PLANNED (not yet applied) jar reallocation attached when the user accepted
   * a top-up suggestion. It is NOT executed here — `/transfer-confirm` re-validates
   * and applies it atomically at `confirm()` alongside the debit (Red Team #1/#2).
   * `donors` may include the "pool" sentinel (no jar patch; affects Σactual only);
   * `targetJarId` is the jar to credit, or `null` for a pool-source transfer.
   */
  plannedReallocation?: { donors: import("@/domain/engine").DonorProposal[]; targetJarId: string | null };
  /** Set when the user chose "Bỏ qua, vượt hũ" — spend past the jar's balance. */
  overspend?: boolean;
  /**
   * Category to record the resulting transaction under, when the draft
   * already carries one (currently only agent-proposed transfers, Feature 3 —
   * see `AgentTransferFormCard.tsx`). Takes priority over the source-jar/
   * account default `/transfer-confirm` would otherwise pick.
   */
  categoryId?: string;
  source?: "mock";
}

const PREFIX = "msb-pfm.transfer-draft.";

export function putTransferDraft(draft: StoredTransferDraft): void {
  try {
    window.sessionStorage.setItem(`${PREFIX}${draft.id}`, JSON.stringify(draft));
  } catch {
    // ignore storage errors — the confirm screen will show an empty form
  }
}

export function getTransferDraft(id: string): StoredTransferDraft | null {
  if (!id) return null;
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as StoredTransferDraft) : null;
  } catch {
    return null;
  }
}

const USED_PREFIX = "msb-pfm.used-draft.";

/**
 * Consume a draft after a transfer is recorded so a reload/replay of
 * `/transfer-confirm?draftId=…` can never resubmit it. Removes the draft and
 * leaves a lightweight "used" marker the confirm screen checks to distinguish
 * "already completed" from "no draft".
 */
export function deleteTransferDraft(id: string): void {
  if (!id) return;
  try {
    window.sessionStorage.removeItem(`${PREFIX}${id}`);
    window.sessionStorage.setItem(`${USED_PREFIX}${id}`, "1");
  } catch {
    // ignore storage errors
  }
}

/** Whether a draft id was already consumed by a completed transfer. */
export function isTransferDraftUsed(id: string): boolean {
  if (!id) return false;
  try {
    return window.sessionStorage.getItem(`${USED_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}
