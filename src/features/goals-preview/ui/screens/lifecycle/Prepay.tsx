"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Trả nợ trước hạn — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function Prepay({ params }: ScreenProps) {
  return <ScreenStub title="Trả nợ trước hạn" params={params} />;
}
