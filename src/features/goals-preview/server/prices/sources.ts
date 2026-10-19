import "server-only";

import type { MarketKind } from "../../data/market";

const TIMEOUT_MS = 8000;

export const FETCH_FROM_FIRST = "2025-09-01";

export interface SourcePoint {
  instrumentId: string;
  priceDate: string;
  /** VND per unit. */
  price: number;
  /** Number as the source quotes it (before unit conversion). */
  rawPrice: number;
  source: string;
}

export interface SourceInstrument {
  id: string;
  kind: MarketKind;
  name: string;
  /** Company / fund full name (optional). */
  fullName?: string;
  unit: string;
  fractional: boolean;
  source: string;
  externalRef: string | null;
}

export interface SourceResult {
  source: string;
  points: SourcePoint[];
  instruments: SourceInstrument[];
  /** Lỗi theo nguồn (không ném ra ngoài). */
  errors: string[];
}

/** Từ khi nào cần lấy lịch sử cho một công cụ (ISO `YYYY-MM-DD`). */
export type SinceFn = (instrumentId: string) => string;

export const VN30 = [
  "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG",
  "LPB", "MBB", "MSN", "MWG", "PLX", "SAB", "SHB", "SSB", "SSI", "STB",
  "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE",
] as const;

const VN_OFFSET_MS = 7 * 3600_000;

/** Ngày theo giờ Việt Nam (UTC+7). */
export function vnDate(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Chạy `fn` trên từng phần tử với tối đa `limit` request song song. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// --- Vàng -----------------------------------------------------------------

const GOLD_INSTRUMENTS: SourceInstrument[] = [
  { id: "gold-sjc", kind: "gold", name: "Vàng miếng SJC", unit: "chỉ", fractional: true, source: "gold", externalRef: "SJC" },
  { id: "gold-ring", kind: "gold", name: "Vàng nhẫn 9999", unit: "chỉ", fractional: true, source: "gold", externalRef: "N24K" },
];

async function goldFromPnj(today: string): Promise<SourcePoint[]> {
  const json = await fetchJson("https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00");
  const rows = isRecord(json) && Array.isArray(json.data) ? json.data : [];
  const pick = (masp: string, instrumentId: string): SourcePoint => {
    const row = rows.find((r) => isRecord(r) && r.masp === masp);
    const buy = isRecord(row) ? Number(row.giamua) : NaN;
    if (!(buy > 0)) throw new Error(`PNJ thiếu giá ${masp}`);
    return { instrumentId, priceDate: today, price: buy * 1000, rawPrice: buy, source: "pnj" };
  };
  return [pick("SJC", "gold-sjc"), pick("N24K", "gold-ring")];
}

async function goldFromBtmc(today: string): Promise<SourcePoint[]> {
  const json = await fetchJson("http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v");
  const data = isRecord(json) && isRecord(json.DataList) && Array.isArray(json.DataList.Data) ? json.DataList.Data : [];
  let sjc: number | null = null;
  let ring: number | null = null;
  for (const row of data) {
    if (!isRecord(row)) continue;
    const rowNo = String(row["@row"] ?? "");
    const name = String(row[`@n_${rowNo}`] ?? "").toUpperCase();
    const buy = Number(row[`@pb_${rowNo}`]);
    if (!(buy > 0)) continue;
    // Bảng trả về bản mới nhất trước: lấy dòng đầu tiên khớp.
    if (sjc === null && name.includes("VÀNG MIẾNG SJC")) sjc = buy;
    if (ring === null && name.includes("NHẪN")) ring = buy;
  }
  if (sjc === null || ring === null) throw new Error("BTMC thiếu giá SJC/nhẫn");
  return [
    { instrumentId: "gold-sjc", priceDate: today, price: sjc, rawPrice: sjc, source: "btmc" },
    { instrumentId: "gold-ring", priceDate: today, price: ring, rawPrice: ring, source: "btmc" },
  ];
}

/** Vàng không có lịch sử: chỉ ghi giá hôm nay. PNJ trước, lỗi thì BTMC. */
export async function fetchGold(now: Date): Promise<SourceResult> {
  const today = vnDate(now);
  const errors: string[] = [];
  try {
    return { source: "gold", points: await goldFromPnj(today), instruments: GOLD_INSTRUMENTS, errors };
  } catch (e) {
    errors.push(`pnj: ${errMsg(e)}`);
  }
  try {
    return { source: "gold", points: await goldFromBtmc(today), instruments: GOLD_INSTRUMENTS, errors };
  } catch (e) {
    errors.push(`btmc: ${errMsg(e)}`);
  }
  return { source: "gold", points: [], instruments: [], errors };
}

// --- Cổ phiếu VN30 --------------------------------------------------------

function stockUrl(symbol: string, since: string, now: Date): string {
  const from = Math.floor(new Date(`${since}T00:00:00+07:00`).getTime() / 1000);
  const to = Math.floor(now.getTime() / 1000);
  return `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`;
}

function stockPoints(symbol: string, json: Record<string, unknown>): SourcePoint[] {
  const t = json.t as unknown[];
  const c = json.c as unknown[];
  const points: SourcePoint[] = [];
  for (let i = 0; i < t.length; i++) {
    const ts = Number(t[i]);
    const close = Number(c[i]);
    if (!Number.isFinite(ts) || !(close > 0)) continue;
    points.push({
      instrumentId: `stock-${symbol.toLowerCase()}`,
      priceDate: vnDate(new Date(ts * 1000)),
      price: Math.round(close * 1000),
      rawPrice: close,
      source: "vndirect",
    });
  }
  return points;
}

async function stockHistory(symbol: string, since: string, now: Date): Promise<SourcePoint[]> {
  const json = await fetchJson(stockUrl(symbol, since, now));
  if (!isRecord(json) || !Array.isArray(json.t) || !Array.isArray(json.c)) throw new Error("phản hồi không có t/c");
  return stockPoints(symbol, json);
}

export type StockLookup =
  | { status: "ok"; symbol: string; points: SourcePoint[] }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Kiểm một mã cổ phiếu bất kỳ qua VNDirect và lấy lịch sử từ `FETCH_FROM_FIRST`.
 * Mã không có thật: VNDirect trả 200 với thân rỗng (hoặc `no_data`/mảng rỗng) → `not_found`.
 * Lỗi mạng / HTTP / JSON hỏng → `error` (không kết luận mã không tồn tại).
 */
export async function lookupStock(symbolRaw: string, now: Date): Promise<StockLookup> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return { status: "not_found" };
  try {
    const res = await fetch(stockUrl(symbol, FETCH_FROM_FIRST, now), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
    const text = (await res.text()).trim();
    if (text === "") return { status: "not_found" };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { status: "error", message: "phản hồi không phải JSON" };
    }
    if (!isRecord(json)) return { status: "error", message: "phản hồi không hợp lệ" };
    if (json.s === "no_data") return { status: "not_found" };
    if (!Array.isArray(json.t) || !Array.isArray(json.c)) return { status: "error", message: "phản hồi không có t/c" };
    const points = stockPoints(symbol, json);
    return points.length === 0 ? { status: "not_found" } : { status: "ok", symbol, points };
  } catch (e) {
    return { status: "error", message: errMsg(e) };
  }
}

/** VN30 cùng các mã khách đã đăng ký thêm (`extraSymbols`). */
export async function fetchStocks(now: Date, since: SinceFn, extraSymbols: readonly string[] = []): Promise<SourceResult> {
  const symbols = [...new Set<string>([...VN30, ...extraSymbols])];
  const results = await mapLimit(symbols, 6, async (symbol) => {
    try {
      const points = await stockHistory(symbol, since(`stock-${symbol.toLowerCase()}`), now);
      return { symbol, points, error: null as string | null };
    } catch (e) {
      return { symbol, points: [] as SourcePoint[], error: `${symbol}: ${errMsg(e)}` };
    }
  });
  const instruments: SourceInstrument[] = [];
  const points: SourcePoint[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.error) errors.push(r.error);
    if (r.points.length === 0) continue;
    instruments.push({
      id: `stock-${r.symbol.toLowerCase()}`, kind: "stock", name: r.symbol,
      unit: "cổ phiếu", fractional: false, source: "vndirect", externalRef: r.symbol,
    });
    points.push(...r.points);
  }
  return { source: "stocks", points, instruments, errors };
}

// --- Quỹ Fmarket ----------------------------------------------------------

function fmarketDate(iso: string): string {
  return iso.replaceAll("-", "");
}

export async function fetchFunds(now: Date, since: SinceFn): Promise<SourceResult> {
  const errors: string[] = [];
  let rows: Record<string, unknown>[] = [];
  try {
    const json = await fetchJson("https://api.fmarket.vn/res/products/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        types: ["NEW_FUND", "TRADING_FUND"], issuerIds: [], sortOrder: "DESC", sortField: "navTo6Months",
        page: 1, pageSize: 100, isIpo: false, fundAssetTypes: [], bondRemainPeriods: [],
        searchField: "", isBuyByReward: false, thirdAppIds: [],
      }),
    });
    const list = isRecord(json) && isRecord(json.data) && Array.isArray(json.data.rows) ? json.data.rows : [];
    rows = list.filter(isRecord);
  } catch (e) {
    return { source: "funds", points: [], instruments: [], errors: [`danh sách: ${errMsg(e)}`] };
  }

  const toDate = fmarketDate(vnDate(now));
  const results = await mapLimit(rows, 6, async (row) => {
    // `code` keeps instrument id stable (`fund-${code}`); shortName is the short label when present.
    const code = String(row.code ?? "").trim();
    const shortLabel = String(row.shortName ?? row.code ?? "").trim() || code;
    const productId = Number(row.id);
    const fullName = String(row.name ?? shortLabel).trim() || shortLabel;
    if (!code || !Number.isFinite(productId)) return null;
    const id = `fund-${code}`;
    try {
      const json = await fetchJson("https://api.fmarket.vn/res/product/get-nav-history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isAllData: 0, productId, fromDate: fmarketDate(since(id)), toDate }),
      });
      const data = isRecord(json) && Array.isArray(json.data) ? json.data : [];
      const points: SourcePoint[] = [];
      for (const d of data) {
        if (!isRecord(d)) continue;
        const nav = Number(d.nav);
        const navDate = String(d.navDate ?? "");
        if (!(nav > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(navDate)) continue;
        points.push({ instrumentId: id, priceDate: navDate, price: nav, rawPrice: nav, source: "fmarket" });
      }
      return { id, shortLabel, fullName, productId, points, error: null as string | null };
    } catch (e) {
      return { id, shortLabel, fullName, productId, points: [] as SourcePoint[], error: `${code}: ${errMsg(e)}` };
    }
  });

  const instruments: SourceInstrument[] = [];
  const points: SourcePoint[] = [];
  for (const r of results) {
    if (!r) continue;
    if (r.error) errors.push(r.error);
    if (r.points.length === 0) continue;
    instruments.push({
      id: r.id, kind: "external_fund", name: r.shortLabel,
      fullName: r.fullName !== r.shortLabel ? r.fullName : undefined,
      unit: "CCQ", fractional: true, source: "fmarket", externalRef: String(r.productId),
    });
    points.push(...r.points);
  }
  return { source: "funds", points, instruments, errors };
}
