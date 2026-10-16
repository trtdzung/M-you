import { describe, expect, it } from "vitest";
import { CATEGORY_BY_ID } from "@/domain/models";
import {
  configFromTemplate,
  DEFAULT_JAR_CONFIG,
  JAR_TEMPLATES,
  JAR_TEMPLATE_LIST,
} from "@/domain/models/jar-defaults";

const percentSum = (jars: { allocation: { mode: string; value: number } }[]) =>
  jars.reduce((s, j) => s + (j.allocation.mode === "percent" ? j.allocation.value : 0), 0);

describe("jar templates (Model A / v2)", () => {
  it("ships exactly three templates: Cá nhân (6), Gia đình (4), Kinh doanh (3)", () => {
    expect(JAR_TEMPLATE_LIST.map((t) => t.id)).toEqual(["caNhan", "giaDinh", "kinhDoanh"]);
    expect(JAR_TEMPLATES.caNhan.jars).toHaveLength(6);
    expect(JAR_TEMPLATES.giaDinh.jars).toHaveLength(4);
    expect(JAR_TEMPLATES.kinhDoanh.jars).toHaveLength(3);
  });

  it("every template's percents sum ≤ 100 (never starts over-allocated)", () => {
    for (const t of JAR_TEMPLATE_LIST) {
      expect(percentSum(t.jars)).toBeLessThanOrEqual(100);
    }
  });

  it("no category appears in two jars within a template (one-category-one-jar)", () => {
    for (const t of JAR_TEMPLATE_LIST) {
      const mapped = t.jars.flatMap((j) => j.categoryIds);
      expect(new Set(mapped).size).toBe(mapped.length);
    }
  });

  it("maps only real expense categories", () => {
    for (const t of JAR_TEMPLATE_LIST) {
      for (const jar of t.jars) {
        for (const id of jar.categoryIds) {
          expect(CATEGORY_BY_ID[id]?.kind).toBe("expense");
        }
      }
    }
  });

  it("DEFAULT_JAR_CONFIG is v2 Cá nhân, with no legacy fields", () => {
    expect(DEFAULT_JAR_CONFIG.version).toBe(2);
    expect(DEFAULT_JAR_CONFIG).toEqual(configFromTemplate(JAR_TEMPLATES.caNhan));
    expect("incomeBasis" in DEFAULT_JAR_CONFIG).toBe(false);
  });
});
