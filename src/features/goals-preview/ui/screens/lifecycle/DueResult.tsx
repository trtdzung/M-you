"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Kết quả đến hạn — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function DueResult({ params }: ScreenProps) {
  return <ScreenStub title="Kết quả đến hạn" params={params} />;
}
