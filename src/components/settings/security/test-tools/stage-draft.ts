// After a scenario card writes its events, run the rule once so the inspector
// has a level, a scenario and an agent_status. The fraud agent is already off.

import { emitEngineChange } from "./sim";
import { rememberDraftReview, type DraftReview } from "./draft-memory";

export async function stageTransfer(cif: string, review: DraftReview): Promise<void> {
  rememberDraftReview(review);
  const res = await fetch("/api/security/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, trigger: "transfer_review", review }),
  });
  if (!res.ok) throw new Error("Không chạy được engine cho lệnh nháp.");
  emitEngineChange();
}
