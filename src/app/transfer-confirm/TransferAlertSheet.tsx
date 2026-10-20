"use client";

import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/primitives";
import { Emphasized } from "@/components/security/InterventionCopy";
import { Diagnosis } from "@/components/security/Diagnosis";
import type { Intervention } from "@/lib/security/intervention-types";
import {
  TRANSFER_LABELS, TRANSFER_RED_STEPS, TRANSFER_SUPPORT_HREF, transferSupportHref,
  transferProceedLabel, transferRecipientSummary, transferRedReason,
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

  return (
    <Sheet open title={TRANSFER_RED_STEPS.heading.text} onClose={close}>
      <div data-testid="shield-red" className="shield-alert-content">
        {step === "question" && <>
          {reason && <p className="shield-red-reason"><Emphasized {...reason} /></p>}
          {details && <p>{transferRecipientSummary(details)}</p>}
          <Diagnosis cif={cif} id={intervention.id} sessionLine={false} sourceLine={false}
            question={TRANSFER_RED_STEPS.question} onAnswer={answer => setStep(answer === "Có" ? "yes" : "no")} />
        </>}
        {step === "yes" && <>
          <p><Emphasized {...TRANSFER_RED_STEPS.yes.message} /></p>
          <ol className="list-decimal pl-5">
            {TRANSFER_RED_STEPS.yes.steps.map(item => <li key={item}>{item}</li>)}
          </ol>
        </>}
        {step === "no" && <p><Emphasized {...TRANSFER_RED_STEPS.no.message} /></p>}
      </div>
      {step !== "question" && <div className="shield-alert-actions mt-5">
        <button type="button" className="shield-danger-primary" onClick={() => onChoose(TRANSFER_LABELS.stop)}>
          {TRANSFER_LABELS.stop}
        </button>
        {step === "yes"
          ? <a className="shield-danger-link" href={TRANSFER_SUPPORT_HREF} onClick={event => {
            event.preventDefault();
            router.push(transferSupportHref(window.location.pathname + window.location.search));
          }}>{TRANSFER_LABELS.support}</a>
          : <button type="button" className="shield-danger-link disabled:opacity-50" disabled={seconds > 0}
              onClick={() => { if (seconds === 0) onChoose(TRANSFER_LABELS.proceed); }}>
              {transferProceedLabel(seconds)}
            </button>}
      </div>}
    </Sheet>
  );
}
