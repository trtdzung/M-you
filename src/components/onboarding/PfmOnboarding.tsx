"use client";

import { useState } from "react";
import type { JarTemplate } from "@/domain/models/jar-defaults";
import { useJarConfig } from "@/state/jars";
import { HuTemplatePicker } from "./HuTemplatePicker";
import { TrackedAccountsReview } from "./TrackedAccountsReview";

/**
 * First-run PFM setup (one screen, BIDV-lite): pick a seed jar set + review the
 * accounts to track, then "Bắt đầu". The CTA seeds the chosen template via
 * `applyTemplate` (which heals to exactly-one) and marks onboarding done — the
 * flag swaps this screen for the tab host at the overview. Everything here is
 * editable later in Cài đặt, so setup stays deliberately short.
 */
export function PfmOnboarding({ onComplete }: { onComplete: () => void }) {
  const { applyTemplate } = useJarConfig();
  const [selected, setSelected] = useState<JarTemplate["id"]>("caNhan");

  function start() {
    applyTemplate(selected);
    onComplete();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <h1 className="text-lg font-semibold text-text">Thiết lập ví của bạn</h1>
        <p className="mt-1 text-sm text-muted">
          Chọn bộ hũ phù hợp để nhóm chi tiêu và đặt hạn mức mỗi tháng. Bạn có thể chỉnh lại bất cứ lúc nào.
        </p>

        <section className="mt-5" aria-labelledby="onboarding-templates">
          <h2 id="onboarding-templates" className="mb-2 text-sm font-semibold text-text">
            Bộ hũ mẫu
          </h2>
          <HuTemplatePicker selectedId={selected} onSelect={setSelected} />
        </section>

        <section className="mt-6" aria-labelledby="onboarding-accounts">
          <h2 id="onboarding-accounts" className="mb-2 text-sm font-semibold text-text">
            Tài khoản theo dõi
          </h2>
          <TrackedAccountsReview />
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <button
          type="button"
          onClick={start}
          className="min-h-12 w-full rounded-full bg-primary text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Bắt đầu
        </button>
      </div>
    </div>
  );
}
