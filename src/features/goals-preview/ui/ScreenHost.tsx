"use client";

import { useEffect } from "react";
import { SkeletonCard } from "@/components/states";
import { usePreview } from "../store/PreviewStore";
import { SCREEN_REGISTRY } from "./registry";

/** Renders the top entry of the in-store screen stack. */
export function ScreenHost() {
  const { nav, hydrated } = usePreview();
  const entry = nav.current;

  useEffect(() => {
    const container = document.getElementById("pfm-panel-goals") ?? document.getElementById("main-content");
    container?.scrollTo({ top: 0 });
  }, [entry.key]);

  if (!hydrated) return <SkeletonCard className="mt-4 h-40" />;
  const def = SCREEN_REGISTRY[entry.screen] ?? SCREEN_REGISTRY.FlowMap;
  const Screen = def.component;
  return (
    <div key={entry.key} data-screen={entry.screen} className="goals-preview-screen">
      <Screen params={entry.params} />
    </div>
  );
}
