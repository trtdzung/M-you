"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Mô phỏng khoản vay — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function LoanSimulator({ params }: ScreenProps) {
  return <ScreenStub title="Mô phỏng khoản vay" params={params} />;
}
