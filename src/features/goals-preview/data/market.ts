import type { PricePoint } from "../model/types";

/**
 * Market prices for assets held OUTSIDE MSB (gold, listed stocks, other managers' funds).
 * Real daily prices live in `gv2_prices`; the list is loaded at runtime via `hydrateMarket`.
 */
export type MarketKind = "gold" | "stock" | "external_fund";

export interface MarketInstrument {
  id: string;
  kind: MarketKind;
  name: string;
  /** Unit the customer counts in ("chỉ", "cổ phiếu", "CCQ"). */
  unit: string;
  /** Quantities may be fractional (gold in chỉ, fund units). */
  fractional: boolean;
  priceSeries: PricePoint[];
}

/** Danh sách công cụ thị trường: giá thật theo ngày từ `gv2_prices`, nạp lúc chạy bởi server / client. */
export const MARKET_INSTRUMENTS: MarketInstrument[] = [];

/** Thay nội dung mảng tại chỗ (giữ nguyên tham chiếu). */
export function hydrateMarket(list: MarketInstrument[]): void {
  MARKET_INSTRUMENTS.splice(0, MARKET_INSTRUMENTS.length, ...list);
}

export function getInstrument(id: string | undefined): MarketInstrument | undefined {
  return id ? MARKET_INSTRUMENTS.find((m) => m.id === id) : undefined;
}

export function instrumentsOf(kind: MarketKind): MarketInstrument[] {
  return MARKET_INSTRUMENTS.filter((m) => m.kind === kind);
}
