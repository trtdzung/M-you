"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Đăng ký vay — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function LoanApply({ params }: ScreenProps) {
  return <ScreenStub title="Đăng ký vay" params={params} />;
}
