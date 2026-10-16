import { cn } from "@/lib/cn";
import { SourceBadge, type Source } from "./SourceBadge";
import { Freshness } from "./Freshness";

/**
 * Provenance chip (invariant #5): a value's origin badge, optionally paired with
 * its freshness. Thin wrapper over `SourceBadge` so every phase renders the same
 * provenance styling from one place (DRY). Use wherever a displayed number needs
 * to declare where it came from and how fresh it is.
 */
export function ProvenanceChip({
  source,
  freshness,
  className,
}: {
  source: Source;
  /** ISO timestamp of the underlying data, if known. */
  freshness?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <SourceBadge source={source} />
      {freshness !== undefined && <Freshness at={freshness} className="text-[11px]" />}
    </span>
  );
}
