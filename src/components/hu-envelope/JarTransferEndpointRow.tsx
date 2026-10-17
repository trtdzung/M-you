import { ChevronRight, Inbox, type LucideIcon } from "lucide-react";
import { POOL_DONOR_ID, type TransferEndpoint } from "@/domain/engine";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";

/** "Có thể chuyển X" for a known balance (never a negative figure), else "Chưa có số dư". */
export function endpointCaption(e: TransferEndpoint): string {
  return e.cap === null ? "Chưa có số dư" : `Có thể chuyển ${formatVnd(e.cap)}`;
}

/** The pool gets a fixed icon; a jar uses its configured one. */
export function endpointIcon(e: TransferEndpoint, jarIconOf: (id: string) => LucideIcon): LucideIcon {
  return e.id === POOL_DONOR_ID ? Inbox : jarIconOf(e.id);
}

/**
 * One tappable endpoint line (≥ 48px): icon + name + caption. Used for the
 * "TỪ HŨ" / "ĐẾN HŨ" selectors and for every option in the picker. A disabled
 * option states WHY in words (`reason`) — colour alone is never the signal.
 */
export function JarTransferEndpointRow({
  endpoint,
  Icon,
  onClick,
  placeholder,
  reason,
  showChevron = false,
  ariaLabel,
  describedBy,
}: {
  endpoint: TransferEndpoint | null;
  Icon: LucideIcon | null;
  onClick: () => void;
  /** Text when no endpoint is chosen yet ("Chọn hũ nhận"). */
  placeholder?: string;
  /** Disabled with this explanation when set. */
  reason?: string | null;
  showChevron?: boolean;
  ariaLabel?: string;
  /** Id of an error message describing this row. */
  describedBy?: string;
}) {
  const disabled = Boolean(reason);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      className={cn(
        "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors",
        "hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface",
      )}
    >
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text">
          <Icon size={16} aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text">{endpoint?.label ?? placeholder}</span>
        {endpoint && <span className="text-xs text-muted">{reason ?? endpointCaption(endpoint)}</span>}
      </span>
      {showChevron && <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />}
    </button>
  );
}
