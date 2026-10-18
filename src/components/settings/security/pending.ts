// "Lowering security waits 24h" helpers. Pure, no React.

export const DAY_MS = 24 * 60 * 60 * 1000;

export type PendingOff = Partial<Record<"aiProtect" | "antiPhishing", number>>;

/** True while a requested change (effective at `at`) has not taken effect yet. */
export function isPending(at: number | undefined, now: number): at is number {
  return at !== undefined && at > now;
}

/** "HH:mm dd/MM" in Vietnamese locale. */
export function formatPendingAt(at: number): string {
  const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  // vi-VN joins day and month with "-", so build "dd/MM" from parts.
  const parts = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).formatToParts(at);
  const part = (type: "day" | "month") => parts.find(item => item.type === type)?.value;
  return `${time} ${part("day")}/${part("month")}`;
}

/** Copy of `pending` without `key`. */
export function withoutPending(pending: PendingOff, key: keyof PendingOff): PendingOff {
  const next = { ...pending };
  delete next[key];
  return next;
}
