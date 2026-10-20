"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/primitives";
import { Emphasized } from "@/components/security/InterventionCopy";
import {
  transferSafeCopy, TRANSFER_SUPPORT_HREF,
  type TransferDetails, type TransferSafeVariant,
} from "@/lib/security/transfer-copy";

export function TransferSafe({ variant, details }: {
  variant: TransferSafeVariant;
  details: TransferDetails;
}) {
  const copy = transferSafeCopy(variant, details);

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <Card role="status">
        <div className="flex items-start gap-3">
          <Check size={24} className="shrink-0 text-primary" aria-hidden />
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-text"><Emphasized {...copy.heading} /></h1>
            <p className="text-sm text-text">{copy.summary}</p>
            <p className="text-sm leading-relaxed"><Emphasized {...copy.message} /></p>
          </div>
        </div>
      </Card>
      <Link href="/" className="login-submit text-center">{copy.primary}</Link>
      <Link href={TRANSFER_SUPPORT_HREF} className="shield-danger-link text-center">{copy.secondary}</Link>
    </div>
  );
}
