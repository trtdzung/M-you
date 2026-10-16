"use client";

import { Suspense } from "react";
import { PfmTabHost } from "@/components/pfm/PfmTabHost";

/**
 * PFM screen: a single route hosting three client-side tabs
 * (Tổng quan · Hũ · Dòng tiền). The overview is the default and can scroll
 * when the viewport or text size needs more room. Deep links via `?tab=` are read
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
