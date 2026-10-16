import { describe, expect, it } from "vitest";
import { CATEGORY_BY_ID } from "@/domain/models";
import {
  configFromTemplate,
  DEFAULT_JAR_CONFIG,
  JAR_TEMPLATES,
  JAR_TEMPLATE_LIST,
} from "@/domain/models/jar-defaults";

describe("jar templates (BIDV wallet model / v3)", () => {
  it("ships exactly three templates: Cá nhân (6), Gia đình (4), Kinh doanh (3)", () => {
    expect(JAR_TEMPLATE_LIST.map((t) => t.id)).toEqual(["caNhan", "giaDinh", "kinhDoanh"]);
    expect(JAR_TEMPLATES.caNhan.jars).toHaveLength(6);
    expect(JAR_TEMPLATES.giaDinh.jars).toHaveLength(4);
    expect(JAR_TEMPLATES.kinhDoanh.jars).toHaveLength(3);
  });

  it("the caNhan savings jar has no categories and NO budgetLimit (chưa đặt, never 0)", () => {
    const savings = JAR_TEMPLATES.caNhan.jars.find((j) => j.id === "savings");
    expect(savings).toBeDefined();
    expect(savings?.categoryIds).toEqual([]);
    expect(savings?.budgetLimit).toBeUndefined();
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

  it("DEFAULT_JAR_CONFIG is v3 Cá nhân, with no legacy allocation field", () => {
    expect(DEFAULT_JAR_CONFIG.version).toBe(3);
    expect(DEFAULT_JAR_CONFIG).toEqual(configFromTemplate(JAR_TEMPLATES.caNhan));
    expect("incomeBasis" in DEFAULT_JAR_CONFIG).toBe(false);
    expect(DEFAULT_JAR_CONFIG.jars.every((j) => !("allocation" in j))).toBe(true);
  });

  it("configFromTemplate returns a version 3 config", () => {
    expect(configFromTemplate(JAR_TEMPLATES.giaDinh).version).toBe(3);
    expect(configFromTemplate(JAR_TEMPLATES.kinhDoanh).version).toBe(3);
  });
});
