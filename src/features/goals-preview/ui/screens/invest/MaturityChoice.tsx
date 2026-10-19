"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Tiền gửi đáo hạn — stub, owned by T4. Keep the export name: ui/registry.ts imports it. */
export function MaturityChoice({ params }: ScreenProps) {
  return <ScreenStub title="Tiền gửi đáo hạn" params={params} />;
}
