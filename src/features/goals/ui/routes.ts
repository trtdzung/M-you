/** Goals live in the "Mục tiêu" tab of /pfm; `/goals` only redirects there. */
export const GOALS_TAB_HREF = "/pfm?tab=goals";

/** Only known PFM origins may be used as goal return destinations. */
export function goalReturnHref(from: string | null): string {
  return from === "budget" ? "/pfm?tab=budget" : GOALS_TAB_HREF;
}
