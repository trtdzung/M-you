import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";
import { DemoBadge } from "./DemoBadge";

/**
 * Logical app canvas. Mobile fills its real visual viewport; desktop uses the
 * canonical 440×956 iPhone 17 Pro Max comparison canvas without simulated
 * device hardware. Short desktop windows uniformly scale the full canvas.
 */
export function PhoneShell({
  children,
  nav,
  fab,
}: {
  children: ReactNode;
  nav?: ReactNode;
  fab?: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background lg:p-4">
      <div className="device-canvas relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-transparent lg:rounded-screen">
        {/* Nền toàn màn "2/9" (Quốc khánh) — lớp phủ cố định trong khung máy: không
            cuộn theo nội dung (chỉ <main> cuộn), trải kín màn kể cả sau bottom nav.
            Scrim mờ đáy giữ tương phản chữ ở vùng ảnh tối. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[url('/bg-2-9.png')] bg-cover bg-top"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-black/20"
        />
        <StatusBar />
        <DemoBadge />
        <main id="main-content" className="shell-main fade-in min-h-0 flex-1 overflow-y-auto px-shell-main-inset pt-1">
          {children}
        </main>
        {fab}
        {nav}
      </div>
    </div>
  );
}
