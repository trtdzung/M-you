import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import type { ProactiveCandidate } from "./core";
import { recordInsightEvent, syncSelectedInsight } from "./store";

const open: Database.Database[] = [];
function db() {
  const database = new Database(":memory:");
  database.exec(readFileSync("data/schema.sql", "utf8"));
  open.push(database);
  return database;
}
afterEach(() => { for (const database of open.splice(0)) database.close(); });

const base: ProactiveCandidate = {
  id: "jar_plan_pressure:2026-09:food", insightType: "jar_plan_pressure", period: "2026-09",
  priorityClass: "P1", severity: "attention", semanticState: "near_limit", action: "review_jars",
  metrics: { jar_id: "food", jar_label: "Ăn uống", budget_limit: 1_000_000,
    spent: 800_000, remaining: 200_000, source: "mock", freshness: "2026-09-14T00:00:00.000Z" },
};
const now = "2026-09-15T00:00:00.000Z";

describe("SQLite Home insight lifecycle", () => {
  it("uses exact cache, reuses copy for metric drift, and supersedes on material state", () => {
    const database = db();
    expect(syncSelectedInsight(database, "CIF_0001", base, now).cache).toBe("new_version");
    expect(syncSelectedInsight(database, "CIF_0001", base, now)).toMatchObject({
      cache: "exact_reuse", insight: { version: 1 },
    });
    const drift = { ...base, metrics: { ...base.metrics, spent: 810_000, remaining: 190_000 } };
    const changed = syncSelectedInsight(database, "CIF_0001", drift, now);
    expect(changed).toMatchObject({ cache: "copy_reuse", insight: { version: 2, metricValue: 190_000 } });
    const material: ProactiveCandidate = { ...drift, severity: "urgent", semanticState: "needs_cover",
      metrics: { ...drift.metrics, spent: 1_100_000, remaining: -100_000 } };
    const next = syncSelectedInsight(database, "CIF_0001", material, now);
    expect(next).toMatchObject({ cache: "new_version", insight: { version: 3, metricValue: -100_000 } });
    expect(next.insight?.title).not.toBe(changed.insight?.title);
    expect(database.prepare("SELECT status FROM proactive_insights WHERE cif = ? ORDER BY version")
      .all("CIF_0001")).toEqual([{ status: "superseded" }, { status: "superseded" }, { status: "active" }]);
  });

  it("persists dismissal for the same fingerprint and allows a changed fact to return", () => {
    const database = db();
    syncSelectedInsight(database, "CIF_0001", base, now);
    expect(recordInsightEvent(database, "CIF_0001", base.id, 1, "displayed", now)).toBe(true);
    expect(recordInsightEvent(database, "CIF_0001", base.id, 1, "displayed", now)).toBe(true);
    expect(recordInsightEvent(database, "CIF_0002", base.id, 1, "dismissed", now)).toBe(false);
    expect(recordInsightEvent(database, "CIF_0001", base.id, 1, "dismissed", now)).toBe(true);
    expect(syncSelectedInsight(database, "CIF_0001", base, now)).toEqual({ cache: "dismissed", insight: null });
    expect(database.prepare("SELECT count(*) n FROM proactive_insight_events WHERE cif = ?")
      .get("CIF_0001")).toEqual({ n: 2 });
    const drift = { ...base, metrics: { ...base.metrics, spent: 850_000, remaining: 150_000 } };
    expect(syncSelectedInsight(database, "CIF_0001", drift, now)).toMatchObject({ insight: { version: 2 } });
  });

  it("resolves the old top insight and isolates personas", () => {
    const database = db();
    syncSelectedInsight(database, "CIF_0001", base, now);
    syncSelectedInsight(database, "CIF_0002", base, now);
    expect(syncSelectedInsight(database, "CIF_0001", null, now)).toEqual({ cache: "no_candidate", insight: null });
    expect(database.prepare("SELECT cif, status FROM proactive_insights ORDER BY cif").all())
      .toEqual([{ cif: "CIF_0001", status: "resolved" }, { cif: "CIF_0002", status: "active" }]);
  });
});
