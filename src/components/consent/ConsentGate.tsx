"use client";

/**
 * Client guard: enforces the consent boundary. If the user has not accepted the
 * current consent version and is not already on an allowed route, redirect to
 * onboarding. Runs after mount (consent lives in localStorage).
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasValidConsent } from "@/lib/consent";
import { Loading } from "@/components/states";

const PUBLIC_ROUTES = new Set(["/onboarding", "/consent"]);

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const consented = hasValidConsent();
    if (!consented && !PUBLIC_ROUTES.has(pathname)) {
      router.replace("/onboarding");
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) return <Loading label="Đang chuẩn bị…" />;
  return <>{children}</>;
}
