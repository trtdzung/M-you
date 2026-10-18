import { PfmHeader } from "@/components/pfm/PfmHeader";

/** PFM page column. The phone frame, calm background, and wallet nav live in `AppChrome`. */
export default function PfmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pfm-shell flex h-full flex-col">
      <PfmHeader />
      {children}
    </div>
  );
}
