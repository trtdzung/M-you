"use client";

import { PreviewStoreProvider } from "./store/PreviewStore";
import { ScreenHost } from "./ui/ScreenHost";
import { PreviewBanner } from "./ui/shared/PreviewBanner";
import { ToastHost } from "./ui/shared/ToastHost";

/** Whole clickable prototype: store + banner + current screen + toasts. */
export function GoalsPreviewApp({ embedded = false }: { embedded?: boolean }) {
  return (
    <PreviewStoreProvider entryScreen={embedded ? "GoalList" : undefined}>
      <div className="goals-preview flex min-h-full flex-col">
        {!embedded && <PreviewBanner />}
        <ScreenHost />
      </div>
      <ToastHost />
    </PreviewStoreProvider>
  );
}
