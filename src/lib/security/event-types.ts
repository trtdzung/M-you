// Scam Shield engine events: what happened to a persona, with the facts the
// signal rules need. Account numbers are kept as the last 4 digits only.

export type IncomeKind = "salary" | "income" | "transfer";

export type SecurityEventPayloads = {
  incoming_credit: { txnId: string; accountId: string; amount: number; senderName: string; senderLast4: string; senderBank: string; kind: IncomeKind };
  transfer_out: { txnId?: string; amount: number; recipientName: string; recipientLast4: string; recipientBank: string; isNewPayee: boolean };
  fd_settled: { amount: number; savingsBefore: number; early: boolean };
  locked_jar_withdrawn: { amount: number; jarId: string; savingsBefore: number };
  device_login: { device: string };
  devices_signed_out: Record<string, never>;
  password_changed: Record<string, never>;
  phone_changed: Record<string, never>;
  screen_share_on: { app?: string };
  screen_share_off: Record<string, never>;
  app_open: Record<string, never>;
  hub_open: Record<string, never>;
  transfer_screen_open: Record<string, never>;
  recipient_entered: { recipientName: string; recipientLast4: string; recipientBank: string };
  intervention_shown: { interventionId: string; scenario: string };
  intervention_answered: { interventionId: string; scenario: string; choice: string };
  account_locked: Record<string, never>;
  case_opened: { caseId: string };
  family_push: { message: string; scenario?: string; contactIds?: string[] };
  /** Simulated handoff of the emergency summary to priority CC/RM. No balances. */
  cc_brief: { summary: string; caseId: string | null };
};

export type SecurityEventType = keyof SecurityEventPayloads;

export const SECURITY_EVENT_TYPES = [
  "incoming_credit", "transfer_out", "fd_settled", "locked_jar_withdrawn", "device_login", "password_changed", "devices_signed_out",
  "phone_changed", "screen_share_on", "screen_share_off", "app_open", "hub_open", "transfer_screen_open",
  "recipient_entered", "intervention_shown", "intervention_answered", "account_locked", "case_opened", "family_push", "cc_brief",
] as const satisfies readonly SecurityEventType[];

export type SecurityEvent<T extends SecurityEventType = SecurityEventType> = {
  id: string;
  cif: string;
  type: T;
  /** ms since epoch, on the engine clock (`engineNow`). */
  at: number;
  payload: SecurityEventPayloads[T];
};

export function isSecurityEventType(value: unknown): value is SecurityEventType {
  return typeof value === "string" && (SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}
