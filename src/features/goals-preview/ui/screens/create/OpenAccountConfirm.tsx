"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Mở tài khoản mục tiêu — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function OpenAccountConfirm({ params }: ScreenProps) {
  return <ScreenStub title="Mở tài khoản mục tiêu" params={params} />;
}
