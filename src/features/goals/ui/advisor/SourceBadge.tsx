import { GOALS_COPY } from "../copy";

/** Where the numbers come from; the demo data is always labelled as simulated. */
export function SourceBadge({ months }: { months: number }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-surface-muted px-2.5 py-1 text-[12px] leading-4 text-muted">
      {GOALS_COPY.advisor.sourceMock(months)}
    </span>
  );
}
