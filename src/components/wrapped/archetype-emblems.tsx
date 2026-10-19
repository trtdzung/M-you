import type { ArchetypeId } from "@/domain/wrapped";

/**
 * One flat, shape-only emblem per archetype (no text in the SVG): a calendar grid for
 * the steady planner, a sun over the horizon for the weekend explorer, a balance beam
 * for the balanced spender. Filled parts use `--wr-accent`. `null` (no label assigned) is a dashed, empty ring.
 */
export function ArchetypeEmblem({ id }: { id: ArchetypeId | null }) {
  return (
    <svg
      viewBox="0 0 64 64"
      data-emblem={id ?? "none"}
      className="h-16 w-16 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {id === "steady-planner" && (
        <>
          <rect x={8} y={12} width={48} height={44} rx={6} />
          <path d="M8 26 H56 M20 6 V16 M44 6 V16" />
          {[18, 32, 46].flatMap((x) => [36, 46].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={2.5} stroke="none" className="fill-(--wr-accent)" />))}
        </>
      )}
      {id === "weekend-explorer" && (
        <>
          <circle cx={32} cy={32} r={10} stroke="none" className="fill-(--wr-accent)" />
          <path d="M32 8 V14 M32 50 V56 M8 32 H14 M50 32 H56 M15 15 L19 19 M45 45 L49 49 M49 15 L45 19 M19 45 L15 49" />
        </>
      )}
      {id === "balanced" && (
        <>
          <path d="M32 10 V52 M20 52 H44 M12 20 H52" />
          <path d="M12 20 L6 36 H18 Z M52 20 L46 36 H58 Z" className="fill-(--wr-accent)" />
        </>
      )}
      {id === null && <circle cx={32} cy={32} r={22} strokeDasharray="6 6" />}
    </svg>
  );
}
