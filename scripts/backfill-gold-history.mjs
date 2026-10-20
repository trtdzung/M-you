#!/usr/bin/env node
// Một lần: nạp data/gold-history.json vào gv2_prices cho những ngày CHƯA có giá (không ghi đè giá đã có).
//   node scripts/backfill-gold-history.mjs [--db đường/dẫn/pfm.sqlite3] [--ring] [--dry]
// Mặc định chỉ gold-sjc (cùng loại với giá pfm đang lấy). --ring nạp thêm gold-ring bằng giá nhẫn SJC (thay thế gần đúng, pfm lấy gold-ring từ PNJ N24K).
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dbPath = args.includes("--db") ? args[args.indexOf("--db") + 1] : fileURLToPath(new URL("../data/pfm.sqlite3", import.meta.url));
const dry = args.includes("--dry");
const series = [{ id: "gold-sjc", field: "sjc" }, ...(args.includes("--ring") ? [{ id: "gold-ring", field: "ring" }] : [])];
const history = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gold-history.json", import.meta.url)), "utf8"));

const db = new Database(dbPath);
const exists = db.prepare("SELECT 1 FROM gv2_instruments WHERE id = ?");
const has = db.prepare("SELECT 1 FROM gv2_prices WHERE instrument_id = ? AND price_date = ?");
const insert = db.prepare(
  "INSERT INTO gv2_prices (instrument_id, price_date, price, raw_price, source, fetched_at) VALUES (?, ?, ?, ?, 'vnappmob', ?)",
);
const now = new Date().toISOString();
db.transaction(() => {
  for (const s of series) {
    if (!exists.get(s.id)) {
      console.log(`${s.id}: chưa có trong gv2_instruments, bỏ qua`);
      continue;
    }
    let added = 0;
    for (const p of history.points) {
      if (has.get(s.id, p.date)) continue;
      if (!dry) insert.run(s.id, p.date, p[s.field], p[s.field] / 1000, now);
      added++;
    }
    console.log(`${s.id}: ${dry ? "sẽ thêm" : "đã thêm"} ${added} ngày`);
  }
})();
db.close();
