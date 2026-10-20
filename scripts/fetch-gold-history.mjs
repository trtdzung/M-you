#!/usr/bin/env node
// Một lần: tải lịch sử giá vàng SJC từ VNAppMob (https://vapi.vnappmob.com, scope gold) ra data/gold-history.json.
// Cần khóa: VNAPPMOB_GOLD_KEY=<khóa> node scripts/fetch-gold-history.mjs [YYYY-MM-DD đầu] (mặc định FETCH_FROM_FIRST).
// Giá tính theo chỉ (1 lượng = 10 chỉ), mỗi ngày giờ VN lấy bản ghi cuối ngày.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const key = process.env.VNAPPMOB_GOLD_KEY;
if (!key) throw new Error("Thiếu VNAPPMOB_GOLD_KEY");
const from = process.argv[2] ?? "2025-09-01";
const url = `https://vapi.vnappmob.com/api/v2/gold/sjc?date_from=${Math.floor(Date.parse(`${from}T00:00:00+07:00`) / 1000)}&date_to=${Math.floor(Date.now() / 1000)}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const { results } = await res.json();
if (!Array.isArray(results) || results.length === 0) throw new Error("Không có dữ liệu");

const vnDay = (sec) => new Date(sec * 1000 + 7 * 3600_000).toISOString().slice(0, 10);
const perChi = (v) => Math.round(Number(v) / 10);
const byDay = new Map();
for (const r of [...results].sort((a, b) => Number(a.datetime) - Number(b.datetime))) {
  const day = vnDay(Number(r.datetime));
  const sjc = perChi(r.buy_1l);
  const ring = perChi(r.buy_nhan1c);
  if (sjc > 0 && ring > 0) byDay.set(day, { date: day, sjc, ring });
}
const points = [...byDay.values()];
writeFileSync(
  fileURLToPath(new URL("../data/gold-history.json", import.meta.url)),
  JSON.stringify({ source: "vnappmob-sjc", unit: "VND/chỉ (giá mua)", fetchedAt: new Date().toISOString(), sjc: "buy_1l / 10 = gold-sjc", ring: "buy_nhan1c / 10 = nhẫn SJC, chỉ dùng thay cho gold-ring khi chọn", points }, null, 2) + "\n",
);
console.log(`Wrote ${points.length} days: ${points[0].date} → ${points.at(-1).date}`);
