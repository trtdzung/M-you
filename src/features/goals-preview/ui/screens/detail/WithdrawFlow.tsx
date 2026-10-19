"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Rút tiền — stub, owned by T3. Keep the export name: ui/registry.ts imports it. */
export function WithdrawFlow({ params }: ScreenProps) {
  return <ScreenStub title="Rút tiền" params={params} />;
}
