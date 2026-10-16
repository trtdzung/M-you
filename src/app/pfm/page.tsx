"use client";

import { Suspense } from "react";
import { PfmTabHost } from "@/components/pfm/PfmTabHost";
import { PfmOnboarding } from "@/components/onboarding/PfmOnboarding";
import { useOnboarded } from "@/state/onboarding";

/**
 * PFM screen: a single route hosting the wallet tabs
 * (Tổng quan · Giao dịch · Ngân sách · Cài đặt) via `PfmTabHost`. On first run
 * (`useOnboarded`) it shows the setup screen instead — the flag is read on the
 * client, so nothing renders until `ready` to avoid a flash of the wrong screen.
 * Deep links via `?tab=` are read inside the host, which needs a Suspense
 * boundary (`useSearchParams`). The "Tài chính" title + back arrow are owned by
 * `PfmHeader` in `pfm/layout.tsx`.
 */
export default function PfmPage() {
  const { onboarded, ready, complete } = useOnboarded();

  return (
    <div className="flex h-full flex-col">
      {ready && !onboarded ? (
        <PfmOnboarding onComplete={complete} />
      ) : (
        <Suspense fallback={null}>{ready ? <PfmTabHost /> : null}</Suspense>
      )}
    </div>
  );
}
