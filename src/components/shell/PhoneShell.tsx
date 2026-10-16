import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";

/**
 * Khung điện thoại **cố định chiều cao** (chuẩn iPhone 17 Pro Max 440×956pt).
 * Toàn bộ UI gói trong màn hình: chỉ `<main>` cuộn nội bộ, nav pill ghim đáy khung.
 * Mobile: full-screen (100dvh). Desktop: device có bezel, canh giữa, cao tối đa 956px.
 */
export function PhoneShell({
  children,
  nav,
}: {
  children: ReactNode;
  nav?: ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] items-center justify-center overflow-hidden bg-neutral-200 sm:p-4">
      <div className="relative flex h-full w-full max-w-phone flex-col overflow-hidden bg-background shadow-2xl sm:h-full sm:max-h-[956px] sm:w-[440px] sm:rounded-[52px] sm:border-[10px] sm:border-neutral-900">
        <StatusBar />
        <main className="fade-in min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-1">
          {children}
        </main>
        {nav}
      </div>
    </div>
  );
}
