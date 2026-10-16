"use client";

import { Suspense } from "react";
import { PfmTabHost } from "@/components/pfm/PfmTabHost";

/**
 * PFM screen: a single route hosting four client-side tabs
 * (Tổng quan · Dòng tiền · Tài sản · Gợi ý). The Tổng quan cockpit is the
 * default and fits one non-scrolling viewport. Deep links via `?tab=` are read
 * inside the host, which needs a Suspense boundary (`useSearchParams`). The
 * "Tài chính" title + back arrow are owned by `PfmHeader` in `pfm/layout.tsx`.
 */
export default function PfmPage() {
  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={null}>
        <PfmTabHost />
      </Suspense>
    </div>
  );
}
