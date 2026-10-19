"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Tạo mục tiêu thành công — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function CreateSuccess({ params }: ScreenProps) {
  return <ScreenStub title="Tạo mục tiêu thành công" params={params} />;
}
