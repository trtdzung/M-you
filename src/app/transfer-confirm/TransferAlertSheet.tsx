"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/primitives";
import { AiSessionNote, Emphasized, SourceLine } from "@/components/security/InterventionCopy";
import { Diagnosis } from "@/components/security/Diagnosis";
import type { Intervention } from "@/lib/security/intervention-types";

const FALLBACK_WAIT_SECONDS = 30;
const PROCEED = "Vẫn tiếp tục";
const STOP = "Dừng lại";
const SCAMMED = "Tôi nghĩ mình bị lừa";

const outline = "shield-action w-full";

/**
 * Red Scam Shield popup (spec section 2: «Popup + câu hỏi phân loại + thông điệp
 * theo kịch bản», «Nút "Tiếp tục" đếm ngược 30–60 giây + chip action [Để MSB gọi
 * lại]»). Confirming opens this instead of committing; only "Vẫn tiếp tục", after
 * the scenario's wait, lets the transfer through. `classifyOnly` asks the
 * diagnostic questions without a way to continue (DH3 "Có người yêu cầu").
 */
export function TransferAlertSheet({ cif, open, intervention, classifyOnly = false, onClose, onChoose }: {
  cif: string;
  open: boolean;
  intervention: Intervention | null;
  classifyOnly?: boolean;
  onClose: () => void;
  onChoose: (choice: string) => void;
}) {
  const wait = intervention?.countdownSec ?? FALLBACK_WAIT_SECONDS;
  const [seconds, setSeconds] = useState(wait);
  const [proposed, setProposed] = useState<string[]>([]);

  useEffect(() => { setProposed([]); }, [intervention?.id]);
  useEffect(() => {
    if (!open) return;
    setSeconds(wait);
    const timer = window.setInterval(() => setSeconds(left => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [open, wait]);

  if (!intervention) return null;
  const { copy } = intervention;
  const chips = classifyOnly ? ["Để MSB gọi lại"] : copy.chips;

  return (
    <Sheet open={open} title="Kiểm tra trước khi chuyển" onClose={onClose}>
      <div data-testid="shield-red" className="shield-alert-content">
        {intervention.source === "agent" && <AiSessionNote />}
        <SourceLine intervention={intervention} />
        {!classifyOnly && <p className="shield-red-reason"><Emphasized text={copy.message} emphasis={copy.emphasis} /></p>}
        {open && <Diagnosis cif={cif} id={intervention.id} sessionLine={intervention.source !== "agent"} sourceLine={false} onChoose={onChoose} onProposals={setProposed} />}
      </div>
      <div className="shield-alert-actions mt-5">
        <button type="button" className="shield-danger-primary" onClick={() => onChoose(STOP)}>{STOP}</button>
        {chips.filter(chip => !proposed.includes(chip)).map(chip => <button key={chip} type="button" className={outline} onClick={() => onChoose(chip)}>{chip}</button>)}
        {!proposed.includes(SCAMMED) && <button type="button" className="shield-danger-secondary" onClick={() => onChoose(SCAMMED)}>{SCAMMED}</button>}
        {intervention.scenario === "DH6" && <button type="button" className={outline} onClick={() => onChoose("Không phải tôi → khóa ngay")}>Không phải tôi → khóa ngay</button>}
        {!classifyOnly && (
          <button type="button" className={`${outline} disabled:opacity-50`} disabled={seconds > 0} onClick={() => onChoose(PROCEED)}>
            {seconds > 0 ? `${PROCEED} (${seconds} giây)` : PROCEED}
          </button>
        )}
      </div>
      <p className="mt-4 pb-2 text-xs leading-relaxed text-muted">M-You không tự chặn tiền của bạn. Bạn quyết định tiếp tục hay dừng.</p>
    </Sheet>
  );
}
