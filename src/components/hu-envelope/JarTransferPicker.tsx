import { ArrowLeft, type LucideIcon } from "lucide-react";
import { POOL_DONOR_ID, type TransferEndpoint } from "@/domain/engine";
import { endpointIcon, JarTransferEndpointRow } from "./JarTransferEndpointRow";

export type PickerSide = "from" | "to";

/**
 * Why `e` cannot be picked for `side`, or `null` when it can. A source must have
 * something to give (cap > 0); a destination must have a balance (pool always
 * does); neither side may be the other side's current choice.
 */
export function pickReason(side: PickerSide, e: TransferEndpoint, otherId: string | null): string | null {
  if (e.id === otherId) return side === "from" ? "Đang là hũ nhận" : "Đang là hũ chuyển";
  if (e.cap === null) return "Chưa có số dư";
  if (side === "from" && e.cap === 0) return "Không còn số dư để chuyển";
  if (side === "to" && e.id !== POOL_DONOR_ID && e.balance === null) return "Chưa có số dư";
  return null;
}

/** In-sheet list view for choosing one endpoint, with a "Quay lại" header. */
export function JarTransferPicker({
  side,
  endpoints,
  otherId,
  jarIconOf,
  onPick,
  onBack,
}: {
  side: PickerSide;
  endpoints: TransferEndpoint[];
  otherId: string | null;
  jarIconOf: (id: string) => LucideIcon;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-1.5 rounded-full px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={16} aria-hidden />
        Quay lại
      </button>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{side === "from" ? "Chọn hũ chuyển" : "Chọn hũ nhận"}</p>
      <ul className="flex flex-col gap-2">
        {endpoints.map((e) => (
          <li key={e.id}>
            <JarTransferEndpointRow
              endpoint={e}
              Icon={endpointIcon(e, jarIconOf)}
              reason={pickReason(side, e, otherId)}
              onClick={() => onPick(e.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
