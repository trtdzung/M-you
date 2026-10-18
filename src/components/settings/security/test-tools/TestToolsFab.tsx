"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { useTestToolsFabStore } from "@/state/security/test-tools";

const TEST_TOOLS_HREF = "/settings/test-tools";

/** Small floating shortcut to the tester panel. Shown only when switched on in Công cụ test. */
export function TestToolsFab() {
  const showFab = useTestToolsFabStore(state => state.showFab);
  // The flag lives in localStorage, so wait for the client to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && showFab ? <TestToolsFabLink /> : null;
}

function TestToolsFabLink() {
  const pathname = usePathname();
  if (pathname === TEST_TOOLS_HREF) return null;

  return <Link
    href={TEST_TOOLS_HREF}
    aria-label="Mở công cụ test"
    title="Công cụ test (demo)"
    className="absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-primary opacity-80 shadow-nav hover:opacity-100"
  >
    <FlaskConical size={20} aria-hidden />
  </Link>;
}
