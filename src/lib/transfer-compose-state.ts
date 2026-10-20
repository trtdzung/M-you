import type { SelectedRecipient } from "@/components/transfer/RecipientPicker";
import type { TransferSource } from "@/components/transfer/TransferAmountStep";

interface TransferComposeState {
  step: "pick" | "bank-entry" | "save-recipient" | "amount";
  recipient: SelectedRecipient | null;
  amount: string;
  memo: string;
  source: TransferSource | null;
  agentCategoryId?: string;
  answeredAlerts: string[];
}

const PREFIX = "msb-pfm.transfer-compose.";
const MAX_AGE_MS = 15 * 60 * 1000;

export function clearTransferComposeState(cif: string): void {
  try {
    window.sessionStorage.removeItem(`${PREFIX}${cif}`);
  } catch {
    // Storage may be unavailable in this browser session.
  }
}

export function saveTransferComposeState(cif: string, state: TransferComposeState): void {
  try {
    window.sessionStorage.setItem(`${PREFIX}${cif}`, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {
    // A storage failure must not prevent navigation.
  }
}

/** Consume once; the next supported departure writes a fresh snapshot. */
export function takeTransferComposeState(cif: string): TransferComposeState | null {
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}${cif}`);
    if (!raw) return null;
    clearTransferComposeState(cif);
    const state = JSON.parse(raw);
    if (!Number.isFinite(state.savedAt) || Date.now() - state.savedAt < 0 || Date.now() - state.savedAt >= MAX_AGE_MS) return null;
    if (!["pick", "bank-entry", "save-recipient", "amount"].includes(state.step)
      || typeof state.amount !== "string" || typeof state.memo !== "string"
      || !Array.isArray(state.answeredAlerts) || !state.answeredAlerts.every((id: unknown) => typeof id === "string")) return null;
    if (state.recipient !== null && (!state.recipient || typeof state.recipient.name !== "string"
      || typeof state.recipient.accountNumber !== "string" || typeof state.recipient.accountMasked !== "string"
      || typeof state.recipient.isNewPayee !== "boolean"
      || !["saved_beneficiary", "transaction_history", "user_typed"].includes(state.recipient.source))) return null;
    if (state.step === "amount" && !state.recipient) return null;
    if (state.source !== null && (!state.source || !["account", "jar", "pool"].includes(state.source.kind)
      || (state.source.kind !== "pool" && typeof state.source.id !== "string"))) return null;
    return state as TransferComposeState;
  } catch {
    return null;
  }
}
