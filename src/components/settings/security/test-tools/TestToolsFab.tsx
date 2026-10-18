"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";

const TEST_TOOLS_HREF = "/settings/test-tools";

/**
 * Off unless the build sets `NEXT_PUBLIC_SHOW_TEST_TOOLS=true` (or `1`).
 * Inlined at build time: restart `npm run dev` after changing it.
 */
export function isTestToolsFabEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_SHOW_TEST_TOOLS;
  return raw === "true" || raw === "1";
}

/** Small floating shortcut to the tester panel, on every screen except the panel itself. */
export function TestToolsFab() {
  // Checked before any hook runs, so a disabled build adds nothing (not even a router read).
  return isTestToolsFabEnabled() ? <TestToolsFabLink /> : null;
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
