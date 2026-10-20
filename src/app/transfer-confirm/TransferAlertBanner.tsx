"use client";

import { TriangleAlert } from "lucide-react";
import { Emphasized } from "@/components/security/InterventionCopy";
import { transferYellowCopy } from "@/lib/security/transfer-copy";
import type { Intervention } from "@/lib/security/intervention-types";

/** Yellow transfer warning stays open; the screen's confirm button continues. */
export function TransferAlertBanner({ intervention, recipientName = "người nhận này", onChoose }: {
  intervention: Intervention;
  recipientName?: string;
  onChoose: (choice: string) => void;
}) {
  const copy = transferYellowCopy(intervention, { recipientName });
  if (!copy) return null;

  return (
    <div role="status" data-testid="shield-banner" className="shield-yellow-banner">
      <div className="flex items-start gap-3">
        <TriangleAlert size={20} className="shrink-0 text-warning" aria-hidden />
        <p><Emphasized {...copy.message} /></p>
      </div>
      <button type="button" onClick={() => onChoose(copy.action)} className="shield-action">
        {copy.action}
      </button>
    </div>
  );
}
