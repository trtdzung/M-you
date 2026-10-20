#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = "https://api-finfo.vndirect.com.vn/v4/stocks?q=type:STOCK~status:listed&size=3000&fields=code,companyName,shortName,floor";
const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const body = await response.json();
const items = [...new Map((Array.isArray(body.data) ? body.data : [])
  .filter(r => typeof r.code === "string" && r.code.trim() && typeof r.companyName === "string" && r.companyName.trim())
  .map(r => {
    const item = { code: r.code.trim().toUpperCase(), companyName: r.companyName.trim(), shortName: typeof r.shortName === "string" ? r.shortName.trim() : null, floor: typeof r.floor === "string" ? r.floor.trim() : null };
    return [item.code, item];
  })).values()].sort((a, b) => a.code.localeCompare(b.code, "en"));
if (items.length < 1000) throw new Error(`Stock directory has only ${items.length} valid rows`);
writeFileSync(fileURLToPath(new URL("../data/stock-directory.json", import.meta.url)), JSON.stringify({ source: "vndirect", fetchedAt: new Date().toISOString(), items }, null, 2) + "\n");
console.log(`Wrote ${items.length} stock directory rows`);
