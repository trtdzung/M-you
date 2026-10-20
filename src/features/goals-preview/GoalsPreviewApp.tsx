"use client";

import { useEffect } from "react";
import { PreviewStoreProvider, useNav } from "./store/PreviewStore";
import { ScreenHost } from "./ui/ScreenHost";
import { PreviewBanner } from "./ui/shared/PreviewBanner";
import { ToastHost } from "./ui/shared/ToastHost";

/** Whole clickable prototype: store + banner + current screen + toasts. */
export function GoalsPreviewApp({ embedded = false }: { embedded?: boolean }) {
  return (
    <PreviewStoreProvider entryScreen={embedded ? "GoalList" : undefined}>
      {embedded && <GoalsTabNavigation />}
      <div className="goals-preview flex min-h-full flex-col">
        {!embedded && <PreviewBanner />}
        <ScreenHost />
      </div>
      <ToastHost />
    </PreviewStoreProvider>
  );
}

function GoalsTabNavigation() {
  const { reset } = useNav();
  useEffect(() => {
    const openList = () => {
      reset("GoalList");
      const panel = document.getElementById("pfm-panel-goals");
      if (panel) panel.scrollTop = 0;
    };
    window.addEventListener("pfm:open-goals-list", openList);
    return () => window.removeEventListener("pfm:open-goals-list", openList);
  }, [reset]);
  return null;
}
