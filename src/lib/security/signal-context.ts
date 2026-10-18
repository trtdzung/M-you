import "server-only";

/**
 * Builds the signal engine's input from what the server knows about a persona:
 * bank history + app transfers, the event log, the protection profile and the
 * fraud warning list. Every time window uses the engine clock.
 */

import type { Transaction } from "@/domain/models";
import { readAccounts } from "@/lib/accounts-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readTransactions } from "@/lib/transactions-store";
import { engineAlertTime, engineNow } from "./clock";
import type { SecurityEvent } from "./event-types";
import { eventsSince } from "./events";
import { readProfile } from "./profile-store";
import { accountKey, accountLastFour, ALERT_RULES, transferHistory, type KnownRecipient, type SignalContext } from "./signals";
import { lookupAccount } from "./warned-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The transfer being judged, as the app knows it before confirming. */
export type TransferReview = {
  amount: number;
  recipientName: string;
  /** Full number when known (needed for the warning-list check); masked otherwise. */
  recipientAccount: string;
  recipientBank?: string;
  memo?: string | null;
  sourceAccountId?: string | null;
};

type Base = {
  now: Date;
  aiProtect: boolean;
  trusted: KnownRecipient[];
  history: Transaction[];
  recent: SecurityEvent[];
};

function loadBase(cif: string): Base {
  const now = engineNow(cif);
  const profile = readProfile(cif);
  return {
    now,
    aiProtect: profile.aiProtect,
    trusted: profile.trustedContacts.map(c => ({ name: c.name, account: c.account, bank: c.bank })),
    history: [...readTransactions(cif), ...readManualTxns(cif)],
    // The longest window any signal needs is T7a's 2 days.
    recent: eventsSince(cif, now.getTime() - Math.max(ALERT_RULES.baitWindowMs, ALERT_RULES.accountChangeWindowMs), [
      "fd_settled", "locked_jar_withdrawn", "device_login", "password_changed", "phone_changed", "transfer_out", "incoming_credit",
    ]),
  };
}

const ofType = <T extends SecurityEvent["type"]>(events: SecurityEvent[], type: T) =>
  events.filter((e): e is SecurityEvent<T> => e.type === type);

/** Accounts the customer dealt with before the bait window (so recent strangers stay strangers). */
function knownAccounts(history: Transaction[], transfersOut: SecurityEvent<"transfer_out">[], before: number): string[] {
  const keys = new Set<string>();
  for (const txn of history) {
    const last4 = accountLastFour(txn.counterpartyAccountNumber);
    if (last4 && Date.parse(txn.postedAt) < before) keys.add(accountKey(last4, txn.counterpartyBankName));
  }
  for (const e of transfersOut) if (e.payload.recipientLast4) keys.add(accountKey(e.payload.recipientLast4, e.payload.recipientBank));
  return [...keys];
}

/** Average regular credit (salary / income) over 90 days, outside the bait window; null when none. */
function usualCredit(history: Transaction[], now: number): number | null {
  const regular = history.filter(t => {
    const at = Date.parse(t.postedAt);
    return t.direction === "credit" && t.type === "income" && t.status === "posted"
      && at < now - ALERT_RULES.baitWindowMs && at >= now - ALERT_RULES.historyDays * DAY_MS;
  });
  return regular.length ? regular.reduce((sum, t) => sum + t.amount, 0) / regular.length : null;
}

function screenSharing(cif: string): boolean {
  const last = eventsSince(cif, 0, ["screen_share_on", "screen_share_off"]).at(-1);
  return last?.type === "screen_share_on";
}

function moneyFacts(cif: string, base: Base) {
  const now = base.now.getTime();
  const transfersOut = ofType(base.recent, "transfer_out");
  return {
    credits: ofType(base.recent, "incoming_credit").map(e => ({
      at: e.at, amount: e.payload.amount, kind: e.payload.kind,
      sender: { last4: e.payload.senderLast4, bank: e.payload.senderBank, name: e.payload.senderName },
    })),
    knownAccounts: knownAccounts(base.history, transfersOut, now - ALERT_RULES.baitWindowMs),
    usualCredit: usualCredit(base.history, now),
  };
}

/** Signal input for a transfer about to be confirmed. */
export function buildTransferContext(cif: string, review: TransferReview): SignalContext {
  const base = loadBase(cif);
  const now = base.now.getTime();
  const transfersOutAll = eventsSince(cif, 0, ["transfer_out"]) as SecurityEvent<"transfer_out">[];
  const bankHistory = transferHistory(base.history, base.now);
  // Recipients paid through the app are in the event log (app records carry no account number).
  // Orders inside the current 10-minute chain do not make the recipient "known" (T1 + T6).
  const appRecipients: KnownRecipient[] = transfersOutAll
    .filter(e => e.at < now - ALERT_RULES.chainWindowMs)
    .map(e => ({ name: e.payload.recipientName, account: e.payload.recipientLast4, bank: e.payload.recipientBank }));
  const pastRecipients = [...bankHistory.pastRecipients, ...appRecipients];
  const last4 = accountLastFour(review.recipientAccount);
  const key = last4 ? accountKey(last4, review.recipientBank) : null;
  // T1 per spec: never paid before (any name) and not a trusted contact.
  const paidBefore = key !== null && pastRecipients.some(p => {
    const l4 = accountLastFour(p.account);
    return l4 !== null && accountKey(l4, p.bank) === key;
  });
  const accounts = readAccounts(cif);
  const source = accounts.find(a => a.id === review.sourceAccountId) ?? accounts.find(a => a.type === "current");
  const warned = lookupAccount(review.recipientAccount, review.recipientBank);
  const savingsTotal = accounts.filter(a => a.type === "savings").reduce((sum, a) => sum + a.balance, 0);
  return {
    amount: review.amount,
    isNewPayee: !paidBefore,
    recipientName: review.recipientName,
    recipientAccount: review.recipientAccount,
    recipientBank: review.recipientBank,
    memo: review.memo?.trim() || null,
    postedAt: engineAlertTime(cif),
    now: base.now,
    aiProtect: base.aiProtect,
    trusted: base.trusted,
    pastRecipients,
    largestOutflow90d: bankHistory.largestOutflow90d,
    balance: source?.balance ?? null,
    warned: warned.level === "none" ? null : { level: warned.level, note: warned.note },
    savingsWithdrawals: [
      ...ofType(base.recent, "fd_settled").map(e => ({ at: e.at, amount: e.payload.amount, savingsBefore: e.payload.savingsBefore || savingsTotal + e.payload.amount, kind: "fd" as const })),
      ...ofType(base.recent, "locked_jar_withdrawn").map(e => ({ at: e.at, amount: e.payload.amount, savingsBefore: e.payload.savingsBefore, kind: "jar" as const })),
    ],
    accountChanges: base.recent
      .filter(e => e.type === "device_login" || e.type === "password_changed" || e.type === "phone_changed")
      .map(e => ({ at: e.at, kind: e.type as "device_login" | "password_changed" | "phone_changed" })),
    transfersOut: transfersOutAll
      .filter(e => now - e.at <= ALERT_RULES.historyDays * DAY_MS)
      .map(e => ({ at: e.at, amount: e.payload.amount, recipient: { last4: e.payload.recipientLast4, bank: e.payload.recipientBank, name: e.payload.recipientName } })),
    ...moneyFacts(cif, base),
    screenSharing: screenSharing(cif),
  };
}

/** Signal input when money arrives (BT3–BT5): no transfer is judged. */
export function buildIncomingContext(cif: string): Pick<SignalContext, "aiProtect" | "credits" | "knownAccounts" | "usualCredit" | "now"> {
  const base = loadBase(cif);
  return { aiProtect: base.aiProtect, now: base.now, ...moneyFacts(cif, base) };
}
