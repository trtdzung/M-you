import { beforeEach, describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { getProviders } from "@/providers";

const CFG: JarConfig = {
  version: 1,
  incomeBasis: 20_000_000,
  jars: [{ id: "j", label: "J", categoryIds: ["dining"], allocation: { mode: "amount", value: 1_000_000 } }],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("mock provider jar config (persona-scoped, schema-guarded)", () => {
  it("returns null when nothing is stored, so the caller seeds a default", async () => {
    expect(await getProviders("stable").getJarConfig()).toBeNull();
  });

  it("round-trips a saved config", async () => {
    const p = getProviders("stable");
    await p.saveJarConfig(CFG);
    expect(await p.getJarConfig()).toEqual(CFG);
  });

  it("[M11] treats corrupt / wrong-shape storage as absent (never throws)", async () => {
    const p = getProviders("stable");
    const key = "msb-pfm.jars.stable";

    window.localStorage.setItem(key, "not json");
    expect(await p.getJarConfig()).toBeNull();

    window.localStorage.setItem(key, JSON.stringify({ version: 2, jars: [] })); // wrong version
    expect(await p.getJarConfig()).toBeNull();

    window.localStorage.setItem(key, JSON.stringify({ version: 1, incomeBasis: "auto", jars: [{ id: 1 }] }));
    expect(await p.getJarConfig()).toBeNull(); // malformed jar

    window.localStorage.setItem(key, JSON.stringify({ version: 1, incomeBasis: "auto", jars: "nope" }));
    expect(await p.getJarConfig()).toBeNull(); // jars not an array
  });

  it("[H5] isolates config per persona — no leak across personas", async () => {
    const stable = getProviders("stable");
    const wealthy = getProviders("wealthy");

    await stable.saveJarConfig({ ...CFG, incomeBasis: 30_000_000 });

    expect(await wealthy.getJarConfig()).toBeNull(); // wealthy untouched
    expect((await stable.getJarConfig())?.incomeBasis).toBe(30_000_000);
  });

  it("accepts the shipped default template as valid", async () => {
    const p = getProviders("stable");
    await p.saveJarConfig(DEFAULT_JAR_CONFIG);
    expect(await p.getJarConfig()).toEqual(DEFAULT_JAR_CONFIG);
  });
});
