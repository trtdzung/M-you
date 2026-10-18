import data from "../../data/msb-reference.json";

/**
 * Reference data the Agent checks a customer's pasted message/link/number against
 * (`data/msb-reference.json`): MSB's live promotions, its official channels, and a fraud
 * watch list. All records are `source: "mock"` until real MSB feeds replace them.
 */

export type PromotionStatus = "active" | "upcoming" | "expired";
export const PROMOTION_STATUSES: PromotionStatus[] = ["active", "upcoming", "expired"];
export const CHANNEL_TYPES = ["domain", "hotline", "sms_sender", "app"] as const;
export const FRAUD_TYPES = ["phone", "account", "domain"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type FraudType = (typeof FRAUD_TYPES)[number];

export interface Promotion {
  id: string; name: string; summary: string; eligibility: string;
  startDate: string; endDate: string; officialUrl: string; source: "mock";
}
export interface OfficialChannel { id: string; type: ChannelType; value: string; label: string; source: "mock" }
export interface FraudEntry {
  id: string; type: FraudType; value: string; reason: string; reports: number; firstReportedAt: string; source: "mock";
}

export const REFERENCE_AS_OF: string = data.asOf;
const promotions = data.promotions as Promotion[];
const channels = data.officialChannels as OfficialChannel[];
const watchlist = data.fraudWatchlist as FraudEntry[];

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase();

export type Normalized = { type: "number" | "domain" | "text"; value: string };
/** Phones/accounts/hotlines → digits only; anything URL-like → bare host; otherwise folded text. */
export function normalizeValue(raw: string): Normalized {
  const text = raw.trim();
  const host = text.match(/^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/i);
  if (host) return { type: "domain", value: host[1].toLowerCase() };
  const digits = text.replace(/[\s.\-()]/g, "");
  if (/^\+?\d+$/.test(digits)) return { type: "number", value: digits.replace(/^\+84/, "0") };
  return { type: "text", value: fold(text) };
}
const sameDomain = (host: string, official: string) => host === official || host.endsWith(`.${official}`);

function statusOf(p: Promotion, now: Date): PromotionStatus {
  const day = now.toISOString().slice(0, 10);
  return day < p.startDate ? "upcoming" : day > p.endDate ? "expired" : "active";
}
export function listPromotions(filter: { q?: string; status?: PromotionStatus }, now: Date) {
  const q = filter.q ? fold(filter.q) : "";
  return promotions
    .map((p) => ({ ...p, status: statusOf(p, now) }))
    .filter((p) => (!filter.status || p.status === filter.status) && (!q || fold(`${p.name} ${p.summary}`).includes(q)));
}

export function listChannels(type?: ChannelType) {
  return channels.filter((c) => !type || c.type === type);
}
export function checkOfficialChannel(raw: string) {
  const n = normalizeValue(raw);
  const channel = channels.find((c) => {
    if (n.type === "domain") return c.type === "domain" && sameDomain(n.value, c.value);
    if (n.type === "number") return c.type === "hotline" && c.value.replace(/\s/g, "") === n.value;
    return (c.type === "sms_sender" || c.type === "app") && fold(c.value) === n.value;
  });
  return { official: channel !== undefined, channel: channel ?? null };
}

export function listFraud(type?: FraudType) {
  return watchlist.filter((e) => !type || e.type === type);
}
export function checkFraud(raw: string) {
  const n = normalizeValue(raw);
  const entries = watchlist.filter((e) => n.type === "domain"
    ? e.type === "domain" && sameDomain(n.value, e.value)
    : n.type === "number" && e.type !== "domain" && e.value === n.value);
  return { found: entries.length > 0, entries };
}
