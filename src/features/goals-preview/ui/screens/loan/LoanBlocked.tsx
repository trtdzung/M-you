"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Chưa thể vay — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function LoanBlocked({ params }: ScreenProps) {
  return <ScreenStub title="Chưa thể vay" params={params} />;
}
