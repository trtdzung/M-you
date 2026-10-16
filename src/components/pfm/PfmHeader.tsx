import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * PFM sub-app header: back arrow → Home, section title "Tài chính", and a
 * reserved right slot (period selector arrives later). Sits on the calm peach
 * wash with navy ink and no hard border — signals PFM as an entered module.
 */
export function PfmHeader() {
  return (
    <header className="flex items-center gap-2 pb-2 pt-1">
      <Link
        href="/"
        aria-label="Về Trang chủ"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </Link>
      <h1 className="text-xl font-bold tracking-tight text-text">Tài chính</h1>
      <div className="ml-auto" aria-hidden />
    </header>
  );
}
