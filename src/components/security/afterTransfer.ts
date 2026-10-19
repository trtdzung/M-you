"use client";

// After a transfer went through: BT6 «Chuyển cho cùng một người lần thứ 2 trong
// 5 phút» → suggest the trusted list on the success screen. The chip
// "Lưu vào danh bạ tin cậy" reaches the success screen through a window event.

import { pokeInterventions } from "./useInterventions";

export const SHIELD_TRUST_EVENT = "msb-pfm:shield-trust";

export function checkRepeatRecipient(cif: string, recipient: { last4: string; bank: string }): void {
  if (!/^\d{4}$/.test(recipient.last4)) return;
  void fetch("/api/security/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, trigger: "transfer_success", recipient }),
  }).then(pokeInterventions, () => {});
}
