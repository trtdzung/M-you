"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** So sánh phương án — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function OptionsCompare({ params }: ScreenProps) {
  return <ScreenStub title="So sánh phương án" params={params} />;
}
