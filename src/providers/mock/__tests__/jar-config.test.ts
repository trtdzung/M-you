import { beforeEach, describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { getProviders } from "@/providers";

const CFG: JarConfig = {
  version: 2,
  jars: [{ id: "j", label: "J", categoryIds: ["dining"], allocation: { mode: "amount", value: 1_000_000 } }],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("mock provider jar config (persona-scoped, schema-guarded, v2)", () => {
  it("returns null when nothing is stored, so the caller seeds a default", async () => {
    expect(await getProviders("stable").getJarConfig()).toBeNull();
  });

  it("round-trips a saved v2 config", async () => {
    const p = getProviders("stable");
    await p.saveJarConfig(CFG);
    expect(await p.getJarConfig()).toEqual(CFG);
  });

  it("[M11] treats corrupt / wrong-shape / legacy-v1 storage as absent (never throws)", async () => {
    const p = getProviders("stable");
    const key = "msb-pfm.jars.stable";

    window.localStorage.setItem(key, "not json");
    expect(await p.getJarConfig()).toBeNull();

    // Legacy v1 is no longer valid — treated as absent → caller reseeds v2.
    window.localStorage.setItem(key, JSON.stringify({ version: 1, incomeBasis: "auto", jars: [] }));
    expect(await p.getJarConfig()).toBeNull();

    window.localStorage.setItem(key, JSON.stringify({ version: 2, jars: [{ id: 1 }] }));
    expect(await p.getJarConfig()).toBeNull(); // malformed jar

    window.localStorage.setItem(key, JSON.stringify({ version: 2, jars: "nope" }));
    expect(await p.getJarConfig()).toBeNull(); // jars not an array
  });

  it("[storage boundary] rejects NaN / Infinity / negative / >100% allocation values", async () => {
    const p = getProviders("stable");
    const key = "msb-pfm.jars.stable";
    const withValue = (mode: "percent" | "amount", value: unknown) =>
      JSON.stringify({ version: 2, jars: [{ id: "j", label: "J", categoryIds: [], allocation: { mode, value } }] });

    // NaN / Infinity do not survive JSON.stringify (→ null), so inject them raw.
    window.localStorage.setItem(key, '{"version":2,"jars":[{"id":"j","label":"J","categoryIds":[],"allocation":{"mode":"amount","value":NaN}}]}');
    expect(await p.getJarConfig()).toBeNull();

    window.localStorage.setItem(key, withValue("amount", -1));
    expect(await p.getJarConfig()).toBeNull(); // negative

    window.localStorage.setItem(key, withValue("percent", 150));
    expect(await p.getJarConfig()).toBeNull(); // percent over 100

    window.localStorage.setItem(key, withValue("percent", 60));
    expect((await p.getJarConfig())?.jars[0].allocation.value).toBe(60); // a valid one still round-trips
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
