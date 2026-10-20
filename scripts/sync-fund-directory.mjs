#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

async function post(path, body) {
  const response = await fetch(`https://api.fmarket.vn/res/${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Fmarket HTTP ${response.status}`);
  return response.json();
}
const body = await post("products/filter", {
  types: ["NEW_FUND", "TRADING_FUND"], issuerIds: [], sortOrder: "DESC", sortField: "navTo6Months",
  page: 1, pageSize: 100, isIpo: false, fundAssetTypes: [], bondRemainPeriods: [],
  searchField: "", isBuyByReward: false, thirdAppIds: [],
});
const items = [...new Map((Array.isArray(body.data?.rows) ? body.data.rows : []).flatMap(row => {
  if (!row || typeof row !== "object") return [];
  const code = String(row.code ?? "").trim();
  const productId = Number(row.id);
  // Nhãn hiển thị giống lượt đồng bộ (fetchFunds): shortName nếu có, không thì code.
  const label = String(row.shortName ?? row.code ?? "").trim() || code;
  const fullName = String(row.name ?? label).trim() || label;
  if (!code || !Number.isFinite(productId)) return [];
  return [[code, { id: `fund-${code}`, code, label, fullName, productId, nav: [] }]];
})).values()].sort((a, b) => a.code.localeCompare(b.code, "en"));
if (items.length < 30) throw new Error(`Fund directory has only ${items.length} valid rows`);
const now = new Date();
const vnDate = date => new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const fromDate = vnDate(new Date(now.getTime() - 30 * 86400_000)).replaceAll("-", "");
const toDate = vnDate(now).replaceAll("-", "");
let next = 0;
await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
  while (next < items.length) {
    const item = items[next++];
    const history = await post("product/get-nav-history", { isAllData: 0, productId: item.productId, fromDate, toDate });
    if (!Array.isArray(history.data)) throw new Error(`Invalid NAV history for ${item.code}`);
    item.nav = history.data.flatMap(point => {
      if (!point || typeof point !== "object") return [];
      const price = Number(point.nav);
      const date = String(point.navDate ?? "");
      return Number.isFinite(price) && price > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) ? [{ date, price }] : [];
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
}));
writeFileSync(fileURLToPath(new URL("../data/fund-directory.json", import.meta.url)), JSON.stringify({
  source: "fmarket", fetchedAt: now.toISOString(), items,
}, null, 2) + "\n");
console.log(`Wrote ${items.length} funds and ${items.reduce((sum, item) => sum + item.nav.length, 0)} NAV points`);
