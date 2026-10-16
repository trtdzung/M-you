import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { JarConfig } from "@/domain/models";
import { PersonaProvider, usePersona } from "@/providers/context";
import { JarConfigProvider, useJarConfig } from "../jars";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <JarConfigProvider>{children}</JarConfigProvider>
    </PersonaProvider>
  );
}

/** How many jars currently hold a category (must never exceed 1). */
const holders = (cfg: JarConfig, catId: string) =>
  cfg.jars.filter((j) => j.categoryIds.includes(catId)).length;
const jarOf = (cfg: JarConfig, catId: string) =>
  cfg.jars.find((j) => j.categoryIds.includes(catId))?.id;
const percentSum = (cfg: JarConfig) =>
  cfg.jars.reduce((s, j) => s + (j.allocation.mode === "percent" ? j.allocation.value : 0), 0);

beforeEach(() => {
  window.localStorage.clear();
});

describe("JarConfigProvider (v2 snapshot partition)", () => {
  it("seeds the Cá nhân default template on first load (6 jars, v2)", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));
    expect(result.current.config.version).toBe(2);
    expect(jarOf(result.current.config, "dining")).toBe("food");
  });

  it("the seed is not over-allocated (percents sum ≤ 100)", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));
    expect(percentSum(result.current.config)).toBeLessThanOrEqual(100);
  });

  it("assignCategory moves a category and keeps it in exactly one jar", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.assignCategory("dining", "essentials"));
    expect(jarOf(result.current.config, "dining")).toBe("essentials");
    expect(holders(result.current.config, "dining")).toBe(1);

    act(() => result.current.assignCategory("dining", null));
    expect(holders(result.current.config, "dining")).toBe(0);
  });

  it("updateJar overwriting categoryIds strips the prior owner", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.updateJar("food", { categoryIds: ["shopping"] }));
    expect(jarOf(result.current.config, "shopping")).toBe("food");
    expect(holders(result.current.config, "shopping")).toBe(1);
  });

  it("addJar steals a category from any jar that already had it", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() =>
      result.current.addJar({
        id: "fun",
        label: "Vui chơi",
        categoryIds: ["entertainment"],
        allocation: { mode: "amount", value: 1_000_000 },
      }),
    );
    expect(jarOf(result.current.config, "entertainment")).toBe("fun");
    expect(holders(result.current.config, "entertainment")).toBe(1);
  });

  it("applyTemplate REPLACES the whole jar set", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.applyTemplate("kinhDoanh"));
    expect(result.current.config.jars.length).toBe(3);
    expect(result.current.config.jars.map((j) => j.id)).toContain("fixed");
  });

  it("persists mutations through the provider to storage", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.setAllocation("food", { mode: "amount", value: 12_345_000 }));
    await waitFor(() => {
      const raw = window.localStorage.getItem("msb-pfm.jars.stable");
      const parsed = raw ? (JSON.parse(raw) as JarConfig) : null;
      expect(parsed?.jars.find((j) => j.id === "food")?.allocation.value).toBe(12_345_000);
    });
  });

  it("dedupes an overlapping stored v2 config on load (never double-counts)", async () => {
    const overlapping: JarConfig = {
      version: 2,
      jars: [
        { id: "a", label: "A", categoryIds: ["dining", "shopping"], allocation: { mode: "amount", value: 1 } },
        { id: "b", label: "B", categoryIds: ["dining"], allocation: { mode: "amount", value: 1 } },
      ],
    };
    window.localStorage.setItem("msb-pfm.jars.stable", JSON.stringify(overlapping));

    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(2));
    expect(holders(result.current.config, "dining")).toBe(1); // first jar keeps it
    expect(jarOf(result.current.config, "dining")).toBe("a");
  });

  it("discards a stored legacy v1 config and reseeds v2 (migration)", async () => {
    window.localStorage.setItem(
      "msb-pfm.jars.stable",
      JSON.stringify({ version: 1, incomeBasis: "auto", jars: [{ id: "old", label: "Old", categoryIds: [], allocation: { mode: "percent", value: 50 } }] }),
    );
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.version).toBe(2));
    expect(result.current.config.jars.length).toBe(6); // reseeded default, not the v1 set
    expect(result.current.config.jars.some((j) => j.id === "old")).toBe(false);
  });

  it("reloads per persona on switch — config never leaks across personas (H5)", async () => {
    const { result } = renderHook(
      () => ({ jars: useJarConfig(), persona: usePersona() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.jars.config.jars.length).toBe(6));

    act(() => result.current.jars.applyTemplate("kinhDoanh"));
    expect(result.current.jars.config.jars.length).toBe(3);

    act(() => result.current.persona.setPersona("wealthy"));
    await waitFor(() => expect(result.current.jars.config.jars.length).toBe(6)); // fresh seed

    act(() => result.current.persona.setPersona("stable"));
    await waitFor(() => expect(result.current.jars.config.jars.length).toBe(3)); // restored
  });
});
