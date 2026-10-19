"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Nạp tiền — stub, owned by T3. Keep the export name: ui/registry.ts imports it. */
export function DepositFlow({ params }: ScreenProps) {
  return <ScreenStub title="Nạp tiền" params={params} />;
}
