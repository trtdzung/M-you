// The latest transfer draft the scenario cards built, so the Engine inspector
// can read it from any screen. Session only; cleared with the tab.

export type DraftReview = {
  amount: number;
  recipientName: string;
  recipientAccount: string;
  recipientBank?: string;
  memo?: string | null;
  sourceAccountId?: string | null;
};

const KEY = "msb-pfm.shield-last-review";

export function rememberDraftReview(review: DraftReview): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(review));
  } catch {
    // The inspector then falls back to the newest stored intervention.
  }
}

export function readDraftReview(): DraftReview | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as DraftReview;
    if (typeof row.amount !== "number" || row.amount <= 0) return null;
    if (typeof row.recipientName !== "string" || typeof row.recipientAccount !== "string") return null;
    return row;
  } catch {
    return null;
  }
}
