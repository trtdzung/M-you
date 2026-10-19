"use client";

import { Hammer } from "lucide-react";
import type { ScreenParams } from "../../model/screens";
import { useNav } from "../../store/PreviewStore";
import { ScreenHeader } from "./ScreenHeader";
import { secondaryButton } from "./styles";

/** Placeholder rendered by screens that a later task has not built yet. */
export function ScreenStub({ title, params }: { title: string; params?: ScreenParams }) {
  const nav = useNav();
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined);
  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title={title} />
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface-tint px-6 py-12 text-center shadow-card">
        <Hammer size={36} strokeWidth={1.5} className="text-muted" aria-hidden />
        <p className="text-base font-semibold text-text">Đang xây dựng</p>
        <p className="text-sm text-muted">Màn hình “{title}” sẽ có trong bản xem trước sắp tới.</p>
        {entries.length > 0 && (
          <p className="text-[12px] text-muted">
            {entries.map(([k, v]) => `${k}=${String(v)}`).join(" · ")}
          </p>
        )}
      </div>
      {nav.canGoBack && (
        <button type="button" className={secondaryButton} onClick={() => nav.pop()}>
          Quay lại
        </button>
      )}
    </div>
  );
}
