"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { notifyNavigationCommitted } from "@/lib/view-transition";

/** Resolves an in-flight view transition once the App Router has committed the next pathname. */
export function ViewTransitionCommit() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    notifyNavigationCommitted();
  }, [pathname]);
  return null;
}
