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
  amount: number;
  memo: string | null;
  sourceLabel: string;
  recipientSource?: "saved_beneficiary" | "transaction_history" | "user_typed";
  riskFlags?: import("@/domain/models").TransferRiskFlag[];
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
