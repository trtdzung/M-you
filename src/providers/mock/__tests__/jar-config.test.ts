import { beforeEach, describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { getProviders } from "@/providers";

const CFG: JarConfig = {
  version: 3,
  jars: [{ id: "j", label: "J", categoryIds: ["dining"], budgetLimit: 1_000_000 }],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("mock provider jar config (persona-scoped, schema-guarded, v3)", () => {
  it("returns null when nothing is stored, so the caller seeds a default", async () => {
    expect(await getProviders("stable").getJarConfig()).toBeNull();
  });

  it("round-trips a saved v3 config", async () => {
    const p = getProviders("stable");
    await p.saveJarConfig(CFG);
    expect(await p.getJarConfig()).toEqual(CFG);
  });

  it("[M11] treats corrupt / wrong-shape / legacy-v1 storage as absent (never throws)", async () => {
    const p = getProviders("stable");
    const key = "msb-pfm.jars.stable";

    window.localStorage.setItem(key, "not json");
    expect(await p.getJarConfig()).toBeNull();

    // Legacy v1 is no longer valid — treated as absent → caller reseeds v3.
    window.localStorage.setItem(key, JSON.stringify({ version: 1, incomeBasis: "auto", jars: [] }));
    expect(await p.getJarConfig()).toBeNull();

    window.localStorage.setItem(key, JSON.stringify({ version: 3, jars: [{ id: 1 }] }));
    expect(await p.getJarConfig()).toBeNull(); // malformed jar

    window.localStorage.setItem(key, JSON.stringify({ version: 3, jars: "nope" }));
    expect(await p.getJarConfig()).toBeNull(); // jars not an array
  });

  it("[storage boundary] rejects a v3 jar with a NaN/Infinity/negative budgetLimit", async () => {
    const p = getProviders("stable");
    const key = "msb-pfm.jars.stable";
    const withLimit = (value: unknown) =>
      JSON.stringify({ version: 3, jars: [{ id: "j", label: "J", categoryIds: [], budgetLimit: value }] });

    // NaN / Infinity do not survive JSON.stringify (→ null), so inject them raw.
    window.localStorage.setItem(
      key,
      '{"version":3,"jars":[{"id":"j","label":"J","categoryIds":[],"budgetLimit":NaN}]}',
    );
    expect(await p.getJarConfig()).toBeNull();

    window.localStorage.setItem(key, withLimit(-1));
    expect(await p.getJarConfig()).toBeNull(); // negative

    window.localStorage.setItem(key, withLimit(5_000_000));
    expect((await p.getJarConfig())?.jars[0].budgetLimit).toBe(5_000_000); // a valid one still round-trips
  });

  it("[phase 08 migration] a stored legacy v2 config migrates forward to v3 (allocation dropped, budgetLimit + version kept — never wiped)", async () => {
    const p = getProviders("stable");
    const key = "msb-pfm.jars.stable";
    const legacyV2 = {
      version: 2,
      jars: [
        {
          id: "food",
          label: "Ăn uống",
          categoryIds: ["dining", "groceries"],
          allocation: { mode: "amount", value: 3_000_000 },
          budgetLimit: 4_000_000,
          color: "#ff0000",
        },
        {
          id: "savings",
          label: "Tiết kiệm",
          categoryIds: [],
          allocation: { mode: "percent", value: 20 },
          // no budgetLimit — stays unset through migration
        },
      ],
    };
    window.localStorage.setItem(key, JSON.stringify(legacyV2));

    const migrated = await p.getJarConfig();
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(3);
    expect(migrated!.jars).toHaveLength(2);

    const food = migrated!.jars.find((j) => j.id === "food")!;
    expect(food.budgetLimit).toBe(4_000_000); // kept
    expect(food.color).toBe("#ff0000"); // kept
    expect(food.categoryIds).toEqual(["dining", "groceries"]); // kept
    expect("allocation" in food).toBe(false); // dropped

    const savings = migrated!.jars.find((j) => j.id === "savings")!;
    expect(savings.budgetLimit).toBeUndefined(); // stays chưa đặt, never coerced to 0
    expect("allocation" in savings).toBe(false);
  });

  it("[H5] isolates config per persona — no leak across personas", async () => {
    const stable = getProviders("stable");
    const wealthy = getProviders("wealthy");

    await stable.saveJarConfig(CFG);

    expect(await wealthy.getJarConfig()).toBeNull(); // wealthy untouched
    expect((await stable.getJarConfig())?.jars[0].id).toBe("j");
  });

  it("accepts the shipped default template as valid", async () => {
    const p = getProviders("stable");
    await p.saveJarConfig(DEFAULT_JAR_CONFIG);
    expect(await p.getJarConfig()).toEqual(DEFAULT_JAR_CONFIG);
  });
});
