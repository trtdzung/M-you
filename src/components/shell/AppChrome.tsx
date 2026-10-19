"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MYourWidget } from "@/components/pfm/MYourWidget";
import { PfmBottomNav } from "@/components/pfm/PfmBottomNav";
import { VoiceFab } from "@/components/pfm/VoiceFab";
import { canvasZoom, prefersMotion } from "@/lib/motion";
import { goalReturnHref } from "@/features/goals/ui/routes";
import { edgeBackHref, navigationDirection } from "@/lib/navigation-direction";
import { backWithTransition, pushWithTransition } from "@/lib/view-transition";
import { BottomNav } from "./BottomNav";
import { PhoneShell } from "./PhoneShell";
import { InterventionHost } from "@/components/security/InterventionHost";

function FestiveBg() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 bg-[url('/bg-2-9.png')] bg-cover bg-top" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-black/20" />
    </>
  );
}

function CalmBg() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 bg-background" />
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-surface-tint/80 to-transparent" />
    </>
  );
}

function PeachBg() {
  return <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#fce0d5] to-[#fbd0d4]" />;
}

function inHorizontalScroller(target: Element, canvas: HTMLElement): boolean {
  let el: Element | null = target;
  while (el && el !== canvas) {
    if (el instanceof HTMLElement) {
      const overflowX = window.getComputedStyle(el).overflowX;
      if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * One phone frame for every signed-in route. Status bar and nav stay mounted;
 * only `#main-content` changes. Each route keeps the chrome it had in its layout.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <AppChromeFrame>{children}</AppChromeFrame>
      {/* Scam Shield: warnings on every signed-in screen. */}
      <InterventionHost />
    </>
  );
}

function AppChromeFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    const canvas = document.getElementById("device-canvas");
    if (!canvas) return;

    let suppressClick = false;
    let gesture: { id: number; x: number; y: number; tracking: boolean } | null = null;

    function localPoint(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const zoom = canvasZoom(canvas);
      return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
    }

    function onPointerDown(event: PointerEvent) {
      if (!prefersMotion() || event.button !== 0 || !edgeBackHref(pathname)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("input, textarea, select, [data-testid='sheet-root'], [data-block-edge-swipe]")) return;
      if (document.querySelector("[data-testid='sheet-root'], [data-block-edge-swipe]")) return;
      if (inHorizontalScroller(target, canvas!)) return;
      const point = localPoint(event);
      if (point.x > 24) return;
      gesture = { id: event.pointerId, x: point.x, y: point.y, tracking: false };
    }

    function onPointerMove(event: PointerEvent) {
      if (!gesture || gesture.id !== event.pointerId) return;
      const point = localPoint(event);
      const dx = point.x - gesture.x;
      const dy = point.y - gesture.y;
      if (!gesture.tracking) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          gesture = null;
          return;
        }
        gesture.tracking = true;
      }
      const screen = canvas!.querySelector<HTMLElement>(".shell-screen");
      if (screen) screen.style.transform = `translateX(${Math.max(0, dx)}px)`;
    }

    function finishGesture(event: PointerEvent) {
      if (!gesture || gesture.id !== event.pointerId) return;
      const tracked = gesture.tracking;
      const originX = gesture.x;
      gesture = null;
      const screen = canvas!.querySelector<HTMLElement>(".shell-screen");
      if (screen) screen.style.transform = "";
      if (!tracked) return;
      suppressClick = true;
      if (localPoint(event).x - originX < 72) return;
      const target = edgeBackHref(pathname);
      if (target === "history") backWithTransition(() => router.back());
      else if (pathname.startsWith("/goals")) backWithTransition(() => router.replace(goalReturnHref(new URLSearchParams(window.location.search).get("from"))));
      else if (target) pushWithTransition((href) => router.push(href), target);
    }

    function onClickCapture(event: MouseEvent) {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const direction = navigationDirection(
        `${window.location.pathname}${window.location.search}`,
        `${url.pathname}${url.search}`,
      );
      if (direction === "none") return;
      event.preventDefault();
      event.stopPropagation();
      pushWithTransition((href) => router.push(href), `${url.pathname}${url.search}`);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishGesture);
    window.addEventListener("pointercancel", finishGesture);
    canvas.addEventListener("click", onClickCapture, true);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishGesture);
      window.removeEventListener("pointercancel", finishGesture);
      canvas.removeEventListener("click", onClickCapture, true);
      const screen = canvas.querySelector<HTMLElement>(".shell-screen");
      if (screen) screen.style.transform = "";
    };
  }, [pathname, router]);

  const home = pathname === "/";
  const settings = pathname.startsWith("/settings");
  const settingsDetail = settings && pathname !== "/settings";
  const pfm = pathname === "/pfm" || pathname.startsWith("/pfm/");
  const goals = pathname.startsWith("/goals");
  const transfer = pathname === "/transfer" || pathname.startsWith("/transfer-confirm");
  const wrapped = pathname === "/wrapped" || pathname.startsWith("/wrapped/");

  if (pfm) {
    return (
      <PhoneShell
        background={<PeachBg />}
        nav={<PfmBottomNav />}
        fab={<MYourWidget />}
        className="shell-calm pfm-app-shell"
        mainClassName="shell-main--pfm no-scrollbar overflow-x-hidden"
      >
        {children}
      </PhoneShell>
    );
  }

  if (goals) {
    return (
      <PhoneShell background={<PeachBg />} className="shell-calm goals-app-shell" mainClassName="shell-main--goals no-scrollbar overflow-x-hidden">
        {children}
      </PhoneShell>
    );
  }

  if (wrapped) {
    // Story viewer: own edges, no nav/FAB. The calm surface only shows behind the
    // non-story states (loading / error / consent / insufficient).
    return (
      <PhoneShell background={<CalmBg />} className="shell-calm" mainClassName="shell-main--transfer">
        {children}
      </PhoneShell>
    );
  }

  if (transfer) {
    return (
      <PhoneShell background={<PeachBg />} className="shell-calm transfer-shell" mainClassName="shell-main--transfer">
        {children}
      </PhoneShell>
    );
  }

  return (
    <PhoneShell
      className={pathname.startsWith("/accounts") ? "shell-calm accounts-shell" : settings ? "shell-calm settings-shell" : home ? "login-shell home-shell" : undefined}
      mainClassName={settingsDetail ? "settings-main-detail" : undefined}
      background={
        (settings || pathname.startsWith("/accounts")) ? <PeachBg /> : home ? <div aria-hidden className="login-background absolute inset-0 -z-10" /> : <FestiveBg />
      }
      nav={settingsDetail ? undefined : <BottomNav />}
      fab={
        !settings && (
          <Suspense fallback={null}>
            <VoiceFab floating />
          </Suspense>
        )
      }
    >
      {children}
    </PhoneShell>
  );
}
