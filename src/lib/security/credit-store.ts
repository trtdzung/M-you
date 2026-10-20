import "server-only";

import { INCOME, type Transaction } from "@/domain/models";
import { getDb } from "@/lib/db";
import { readTransactions } from "@/lib/transactions-store";
import { findBankByName } from "@/lib/transfer-banks";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { engineNow } from "./clock";
import { recordEvent } from "./events";

export type IncomingCredit = { cif: string; txnId: string };
export class InterCustomerTransferRejectedError extends Error {}

const digits = (value: string) => value.replace(/\D/g, "");

/** Called only inside the debit transaction; any failure rolls back BOTH legs. */
export function creditTransferRecipient(senderCif: string, sourceAccountId: string, amount: number, txn: Transaction): IncomingCredit | undefined {
  if (typeof txn.counterpartyBankName !== "string" || findBankByName(txn.counterpartyBankName)?.id !== "msb") return;
  if (typeof txn.counterpartyAccountNumber !== "string") return;
  const number = digits(txn.counterpartyAccountNumber);
  if (!number) return;
  const db = getDb();
  const matches = (db.prepare("SELECT cif, id, institution, account_number FROM accounts").all() as {
    cif: string; id: string; institution: string; account_number: string;
  }[]).filter(a => findBankByName(a.institution)?.id === "msb" && digits(a.account_number) === number);
  // Ambiguous numbers cannot safely identify a recipient. Own accounts retain their old behavior.
  if (matches.length !== 1 || matches[0].cif === senderCif) return;
  const recipient = matches[0];
  const persona = PERSONA_LIST.find(p => p.cif === senderCif);
  const sender = db.prepare("SELECT account_number FROM accounts WHERE cif = ? AND type = 'current' ORDER BY sort_order LIMIT 1")
    .get(senderCif) as { account_number: string } | undefined;
  if (!persona || !sender?.account_number) throw new InterCustomerTransferRejectedError("Không xác định được người gửi.");
  const source = db.prepare("SELECT balance, available_balance FROM accounts WHERE cif = ? AND id = ?")
    .get(senderCif, sourceAccountId) as { balance: number; available_balance: number } | undefined;
  if (!source) return; // debitAccount retains its account-not-found response
  if (source.balance < amount || source.available_balance < amount) {
    throw new InterCustomerTransferRejectedError("Số dư không đủ để hoàn tất giao dịch.");
  }
  // Seed history before adding the first bank credit, as in the bank history store.
  readTransactions(recipient.cif);
  const postedAt = engineNow(recipient.cif);
  const name = persona.label.split(" — ")[0];
  const id = `incoming-${senderCif}-${txn.id}`;
  const credit: Transaction = {
    id, accountId: recipient.id, postedAt: postedAt.toISOString(), amount, currency: "VND",
    direction: "credit", type: "income", categoryId: INCOME, merchantName: name,
    merchantNormalizedName: name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(),
    status: "posted", source: "mock", isRecurring: false, userEdited: false,
    counterpartyAccountNumber: sender.account_number, counterpartyBankName: "MSB",
    ...(typeof txn.note === "string" ? { note: txn.note } : {}),
  };
  db.prepare("UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE cif = ? AND id = ?")
    .run(amount, amount, recipient.cif, recipient.id);
  db.prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
    .run(recipient.cif, id, credit.postedAt, JSON.stringify(credit));
  recordEvent(recipient.cif, "incoming_credit", {
    txnId: id, accountId: recipient.id, amount, senderName: name,
    senderLast4: digits(sender.account_number).slice(-4), senderBank: "MSB", kind: "transfer",
  }, postedAt.getTime());
  return { cif: recipient.cif, txnId: id };
}
