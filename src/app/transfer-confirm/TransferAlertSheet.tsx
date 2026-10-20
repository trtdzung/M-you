"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Phone } from "lucide-react";
import { formatVnd } from "@/lib/format";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/primitives";
import { Emphasized } from "@/components/security/InterventionCopy";
import { Diagnosis } from "@/components/security/Diagnosis";
import type { Intervention } from "@/lib/security/intervention-types";
import {
  TRANSFER_LABELS, TRANSFER_RED_STEPS, TRANSFER_SUPPORT_HREF, transferSupportHref,
  transferProceedLabel, transferRecipientParts, transferRedReason,
  type TransferDetails,
} from "@/lib/security/transfer-copy";

const FALLBACK_WAIT_SECONDS = 30;

type Props = {
  cif: string;
  open: boolean;
  intervention: Intervention | null;
  classifyOnly?: boolean;
  details?: TransferDetails;
  onClose: () => void;
  onChoose: (choice: string) => void;
};

/** A fresh opening starts at step 1, or directly at 2a for DH3. */
export function TransferAlertSheet(props: Props) {
  if (!props.open || !props.intervention) return null;
  return <TransferAlertSteps key={`${props.intervention.id}:${Boolean(props.classifyOnly)}`} {...props} intervention={props.intervention} />;
}

function TransferAlertSteps({ cif, intervention, classifyOnly = false, details, onClose, onChoose }: Props & { intervention: Intervention }) {
  const router = useRouter();
  const [step, setStep] = useState<"question" | "yes" | "no">(classifyOnly ? "yes" : "question");
  const wait = Math.min(60, Math.max(30, intervention.countdownSec ?? FALLBACK_WAIT_SECONDS));
  const [seconds, setSeconds] = useState(wait);

  useEffect(() => {
    setSeconds(wait);
    const timer = window.setInterval(() => setSeconds(left => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [wait]);

  const reason = transferRedReason(intervention, { recipientName: details?.recipientName ?? "người nhận này" });
  const close = () => onClose();
  const recipient = details ? transferRecipientParts(details) : null;

  return (
    <Sheet bodyClassName="transfer-alert-sheet" open title={TRANSFER_RED_STEPS.heading.text} onClose={close}>
      <div data-testid="shield-red" className="transfer-alert-content">
        <span className="transfer-alert-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
        {step === "question" && <>
          {reason && <p className="transfer-alert-reason"><Emphasized {...reason} /></p>}
          {details && recipient && <div className="transfer-alert-recipient">
            <span className="transfer-alert-avatar" aria-hidden="true">{recipient.initials}</span>
            <div className="transfer-alert-recipient-copy">
              <p className="transfer-alert-recipient-name">{recipient.name}</p>
              <p className="transfer-alert-recipient-meta">{recipient.bankAccount}</p>
            </div>
            {details.amount !== undefined && <p className="transfer-alert-amount">{formatVnd(details.amount)}</p>}
          </div>}
          <Diagnosis cif={cif} id={intervention.id} sessionLine={false} sourceLine={false}
            question={TRANSFER_RED_STEPS.question} onAnswer={answer => setStep(answer === "Có" ? "yes" : "no")} />
        </>}
        {step === "yes" && <>
          <p className="transfer-alert-guidance"><Emphasized {...TRANSFER_RED_STEPS.yes.message} /></p>
          <ol className="transfer-alert-checklist">
            {TRANSFER_RED_STEPS.yes.steps.map((item, index) => <li key={item}><span className="transfer-alert-step" aria-hidden="true">{index + 1}</span><span>{item}</span></li>)}
          </ol>
        </>}
        {step === "no" && <p className="transfer-alert-message"><Emphasized {...TRANSFER_RED_STEPS.no.message} /></p>}
      </div>
      {step !== "question" && <div className="transfer-alert-actions">
        <button type="button" className="transfer-alert-stop" onClick={() => onChoose(TRANSFER_LABELS.stop)}>
          {TRANSFER_LABELS.stop}
        </button>
        {step === "yes"
          ? <a className="transfer-alert-support" href={TRANSFER_SUPPORT_HREF} onClick={event => {
            event.preventDefault();
            router.push(transferSupportHref(window.location.pathname + window.location.search));
          }}><Phone size={16} aria-hidden="true" />{TRANSFER_LABELS.support}</a>
          : <button type="button" className="transfer-alert-proceed" disabled={seconds > 0}
              onClick={() => { if (seconds === 0) onChoose(TRANSFER_LABELS.proceed); }}>
              {transferProceedLabel(seconds)}
            </button>}
      </div>}
    </Sheet>
  );
}
