"use client";

import { useLayoutEffect, useRef } from "react";
import { SkeletonCard } from "@/components/states";
import { EmptyState } from "./shared/EmptyState";
import { usePreview } from "../store/PreviewStore";
import { SCREEN_REGISTRY } from "./registry";

/** Renders the top entry of the in-store screen stack. */
export function ScreenHost() {
  const { nav, hydrated, loadStatus, reload } = usePreview();
  const entry = nav.current;

  const positions = useRef<Record<string, number>>({});
  useLayoutEffect(() => {
    const container = document.getElementById("pfm-panel-goals") ?? document.getElementById("main-content");
    if (!container || !hydrated) return;
    container.scrollTop = positions.current[entry.key] ?? 0;
    const save = () => { positions.current[entry.key] = container.scrollTop; };
    container.addEventListener("scroll", save);
    return () => container.removeEventListener("scroll", save);
  }, [entry.key, hydrated]);

  if (loadStatus === "error") {
    return <EmptyState title="Chưa tải được dữ liệu mục tiêu." description="" ctaLabel="Thử lại" onCta={reload} />;
  }
  if (!hydrated) return <SkeletonCard className="mt-4 h-40" />;
  const def = SCREEN_REGISTRY[entry.screen] ?? SCREEN_REGISTRY.GoalList;
  const Screen = def.component;
  return (
    <div key={entry.key} data-screen={entry.screen} className="goals-preview-screen">
      <Screen params={entry.params} />
    </div>
  );
}
