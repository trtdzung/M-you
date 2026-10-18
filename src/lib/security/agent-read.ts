import "server-only";

import { getDb } from "@/lib/db";
import { readTransactions } from "@/lib/transactions-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { engineNow } from "./clock";
import { eventsSince } from "./events";
import { getIntervention, getInterventionContext } from "./intervention-store";
import { readProfile } from "./profile-store";
import { readCase } from "./case-store";
import { accountKey, accountLastFour } from "./signals";
import { LOOKUP_LABELS, lookupAccount } from "./warned-store";
import { readDiagnosis } from "./diagnosis";
import { CLASSIFY_QUESTIONS } from "./scenario-copy";
import { redactSecurityText } from "./redact";

const DAY = 86400000;
export function agentIntervention(id: string) {
  const row = getDb().prepare("SELECT cif,copy_rule FROM interventions WHERE id=?").get(id) as { cif: string; copy_rule: string } | undefined;
  if (!row) {
    const hold = getDb().prepare("SELECT cif,review,amount,created_at FROM transfer_holds WHERE id=? AND status='holding'").get(id) as { cif: string; review: string; amount: number; created_at: number } | undefined;
    if (!hold) return null;
    const review = JSON.parse(hold.review);
    return { cif: hold.cif, id, level: "green", scenario: null, signals: [{ code: "T1", evidence: "Người nhận mới, vượt ngưỡng giữ lệnh đã đặt" }], amount: hold.amount,
      recipient_last4: accountLastFour(review.recipientAccount), bank: review.recipientBank ?? null, memo: redactSecurityText(review.memo ?? ""), at: hold.created_at,
      rule_copy: { message: "", question: CLASSIFY_QUESTIONS[0], chips: [] }, diagnosis: readDiagnosis(hold.cif, id) };
  }
  const rule = JSON.parse(row.copy_rule);
  const item = getIntervention(row.cif, id)!;
  const context = getInterventionContext(row.cif, id);
  const facts = context?.facts ?? {};
  return { cif: row.cif, id, level: item.level, scenario: item.scenario, signals: item.evidence.map(s => ({ ...s, evidence: redactSecurityText(s.evidence) })),
    amount: facts.amount ?? null, recipient_last4: facts.recipientLast4 ?? null, bank: facts.recipientBank ?? null,
    memo: typeof facts.memo === "string" ? redactSecurityText(facts.memo) : null,
    diagnosis: readDiagnosis(row.cif, id), at: item.createdAt, countdown_sec: item.countdownSec, warned: facts.warned ?? null, rule_copy: { message: rule.message, question: rule.question, chips: rule.chips, emphasis: rule.emphasis } };
}
export function agentRecipient(cif: string, account: string, bank: string) {
  const last4 = accountLastFour(account);
  const key = last4 ? accountKey(last4, bank) : null;
  const txns = [...readTransactions(cif), ...readManualTxns(cif)].filter(t => t.direction === "debit" && t.status === "posted"
    && key && accountLastFour(t.counterpartyAccountNumber) && accountKey(accountLastFour(t.counterpartyAccountNumber)!, t.counterpartyBankName) === key);
  const events = eventsSince(cif, 0, ["transfer_out"]).filter(e => {
    const p = e.payload as { recipientLast4: string; recipientBank: string };
    return key && p.recipientLast4 && accountKey(p.recipientLast4, p.recipientBank) === key;
  });
  const ids = new Set(txns.map(t => t.id));
  const times = txns.map(t => Date.parse(t.postedAt));
  let count = txns.length;
  for (const event of events) {
    const p = event.payload as { txnId?: string };
    if (!p.txnId || !ids.has(p.txnId)) { count++; times.push(event.at); }
  }
  const trusted = readProfile(cif).trustedContacts.some(c => key && accountLastFour(c.account) && accountKey(accountLastFour(c.account)!, c.bank) === key);
  return { last4, bank, count, last_at: times.length ? Math.max(...times) : null, trusted };
}
export function agentLookup(account: string, bank: string) {
  const result = lookupAccount(account, bank);
  return { ...result, label: LOOKUP_LABELS[result.level], last4: accountLastFour(account) };
}
export function agentEvents(cif: string, hours: number) {
  return eventsSince(cif, engineNow(cif).getTime() - hours * 3600000).slice(-100).map(event => {
    const payload = Object.fromEntries(Object.entries(event.payload).filter(([key]) => !/name|contactIds/i.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? redactSecurityText(value) : value]));
    return { type: event.type, at: event.at, payload };
  });
}
export function agentProfile(cif: string) {
  const p = readProfile(cif);
  const contacts = p.emergencyContacts.filter(c => c.status === "active" || c.status === "removing").length;
  return { score: null, score_unknown_reason: "auth settings are not persisted on the server", protection_points: (p.aiProtect ? 10 : 0) + (p.antiPhishingCode ? 15 : 0) + (contacts ? 15 : 0) + (p.trustedContacts.length ? 10 : 0),
    ai_protect: p.aiProtect, anti_phishing: p.antiPhishingCode !== null, active_contacts: contacts,
    account_locked: p.accountLocked, cards_locked: p.cardsLocked ?? p.accountLocked, hold_enabled: p.holdEnabled, hold_threshold: p.holdThreshold };
}
export function agentAlerts(cif: string, days: number) {
  const since = engineNow(cif).getTime() - days * DAY;
  return getDb().prepare("SELECT scenario,level,status,choice,created_at FROM interventions WHERE cif=? AND created_at>=? ORDER BY created_at DESC LIMIT 100").all(cif, since);
}
export function agentCase(id: string) {
  const row = getDb().prepare("SELECT cif FROM fraud_cases WHERE id=?").get(id) as { cif: string } | undefined;
  if (!row) return null;
  // Structured answers only. Recipient is the last four digits; image text is redacted, never bytes.
  const item = readCase(row.cif, id)!;
  const answers = item.answers.map((answer, index) => index === 2 ? (accountLastFour(answer) ?? redactSecurityText(answer)) : redactSecurityText(answer));
  return { cif: row.cif, id: item.id, status: item.status, opened_at: item.openedAt, answers, has_image: item.attachments.length > 0 };
}
