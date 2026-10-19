import type { ISODate, PricePoint } from "../model/types";

/**
 * Simulated market prices for assets held OUTSIDE MSB (gold, listed stocks, other managers' funds).
 * Prototype only: monthly anchors, interpolated daily by the engine. A real build swaps this for a
 * MarketDataProvider feed; the customer only declares quantities, the value follows the price.
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

const MONTHS: ISODate[] = Array.from({ length: 21 }, (_, i) => {
  const y = 2025 + Math.floor((9 + i) / 12);
  const m = ((9 + i) % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
});

/** Monthly anchors from a start price and per-month % moves (repeated to cover the window). */
function series(start: number, movesPct: number[], round: number): PricePoint[] {
  let price = start;
  return MONTHS.map((date, i) => {
    if (i > 0) price *= 1 + movesPct[(i - 1) % movesPct.length] / 100;
    return { date, price: Math.round(price / round) * round };
  });
}

export const MARKET_INSTRUMENTS: MarketInstrument[] = [
  { id: "gold-sjc", kind: "gold", name: "Vàng miếng SJC", unit: "chỉ", fractional: true, priceSeries: series(12_100_000, [1.2, 0.8, -0.6, 1.5, 0.4, -1.1, 0.9], 10_000) },
  { id: "gold-ring", kind: "gold", name: "Vàng nhẫn 9999", unit: "chỉ", fractional: true, priceSeries: series(11_400_000, [1.4, 0.6, -0.9, 1.7, 0.2, -1.3, 1.0], 10_000) },
  { id: "stock-fpt", kind: "stock", name: "FPT", unit: "cổ phiếu", fractional: false, priceSeries: series(124_000, [2.5, -3.1, 4.0, -1.8, 1.2, -4.5, 3.3], 100) },
  { id: "stock-vcb", kind: "stock", name: "VCB", unit: "cổ phiếu", fractional: false, priceSeries: series(91_000, [1.1, -1.4, 2.0, 0.5, -2.2, 1.6, -0.4], 100) },
  { id: "stock-hpg", kind: "stock", name: "HPG", unit: "cổ phiếu", fractional: false, priceSeries: series(27_500, [3.2, -4.0, 2.6, -2.9, 5.1, -3.5, 1.4], 50) },
  { id: "stock-vnm", kind: "stock", name: "VNM", unit: "cổ phiếu", fractional: false, priceSeries: series(64_000, [-1.0, 0.6, -1.8, 1.2, 0.3, -0.7, 0.9], 100) },
  { id: "fund-bond-ext", kind: "external_fund", name: "Quỹ trái phiếu (công ty quản lý quỹ khác)", unit: "CCQ", fractional: true, priceSeries: series(34_200, [0.5, 0.4, 0.6, 0.3, 0.5, 0.4], 10) },
  { id: "fund-equity-ext", kind: "external_fund", name: "Quỹ cổ phiếu (công ty quản lý quỹ khác)", unit: "CCQ", fractional: true, priceSeries: series(28_600, [2.1, -2.6, 3.0, -1.5, 1.8, -3.2], 10) },
];

export function getInstrument(id: string | undefined): MarketInstrument | undefined {
  return id ? MARKET_INSTRUMENTS.find((m) => m.id === id) : undefined;
}

export function instrumentsOf(kind: MarketKind): MarketInstrument[] {
  return MARKET_INSTRUMENTS.filter((m) => m.kind === kind);
}
