"use client";

import { Suspense } from "react";
import { PfmTabHost } from "@/components/pfm/PfmTabHost";

/**
 * PFM screen: a single route hosting the wallet tabs
 * (Tổng quan · Giao dịch · Ngân sách · Mục tiêu) via `PfmTabHost`. There is no
 * first-run setup gate — `JarConfigProvider` always seeds a default template, so
 * the tabs open straight away. Deep links via `?tab=` are read inside the host,
 * which needs a Suspense boundary (`useSearchParams`). The "Tài chính" title +
 * back arrow are owned by `PfmHeader` in `pfm/layout.tsx`.
 */
export default function PfmPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={null}>
        <PfmTabHost />
      </Suspense>
    </div>
  );
}
