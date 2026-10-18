"use client";

// DH4 at «Input TT người thụ hưởng»: as soon as a recipient is entered, ask the
// engine about the account (T2, the fraud warning list). A hit opens the red
// popup through InterventionHost; nothing here blocks the flow.

import { getSecurityCif } from "@/state/security/storage";
import { pokeInterventions } from "./useInterventions";

export function checkRecipient(recipient: { name: string; accountNumber: string; bankName?: string }): void {
  const cif = getSecurityCif();
  if (!cif || !/\d{4}/.test(recipient.accountNumber)) return;
  void fetch("/api/security/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cif,
      trigger: "recipient_entered",
      // The amount is not known yet; only T2 is judged at this step.
      review: { amount: 1, recipientName: recipient.name, recipientAccount: recipient.accountNumber, recipientBank: recipient.bankName ?? null },
    }),
  })
    .then(() => pokeInterventions())
    .catch(() => {});
}
