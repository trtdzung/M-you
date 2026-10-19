"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Mục tiêu của tôi — stub, owned by T3. Keep the export name: ui/registry.ts imports it. */
export function GoalList({ params }: ScreenProps) {
  return <ScreenStub title="Mục tiêu của tôi" params={params} />;
}
