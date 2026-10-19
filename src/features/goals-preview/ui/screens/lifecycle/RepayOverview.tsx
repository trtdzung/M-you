"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Tích luỹ & trả nợ — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function RepayOverview({ params }: ScreenProps) {
  return <ScreenStub title="Tích luỹ & trả nợ" params={params} />;
}
