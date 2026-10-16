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

beforeEach(() => {
  window.localStorage.clear();
});

describe("JarConfigProvider (v3 BIDV wallet model)", () => {
  it("seeds the Cá nhân default template on first load (6 jars, v3)", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));
    expect(result.current.config.version).toBe(3);
    expect(jarOf(result.current.config, "dining")).toBe("food");
  });

  it("assignCategory moves a category and keeps it in exactly one jar", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.assignCategory("dining", "essentials"));
    expect(jarOf(result.current.config, "dining")).toBe("essentials");
    expect(holders(result.current.config, "dining")).toBe(1);
  });

  it("assignCategory(cat, null) is a no-op — unassign is forbidden (exactly-one)", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    const before = jarOf(result.current.config, "dining");
    act(() => result.current.assignCategory("dining", null));
    // Still in its jar — a category can never be left without a jar.
    expect(holders(result.current.config, "dining")).toBe(1);
    expect(jarOf(result.current.config, "dining")).toBe(before);
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
        budgetLimit: 1_000_000,
      }),
    );
    expect(jarOf(result.current.config, "entertainment")).toBe("fun");
    expect(holders(result.current.config, "entertainment")).toBe(1);
  });

  it("removeJar force-moves its categories to 'Khác' (never orphans a category)", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.removeJar("food")); // food owns dining + groceries
    expect(result.current.config.jars.some((j) => j.id === "food")).toBe(false);
    expect(jarOf(result.current.config, "dining")).toBe("khac");
    expect(holders(result.current.config, "dining")).toBe(1);
  });

  it("applyTemplate REPLACES the whole jar set", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.applyTemplate("kinhDoanh"));
    expect(result.current.config.jars.length).toBe(3);
    expect(result.current.config.jars.map((j) => j.id)).toContain("fixed");
  });

  it("resetToSeed restores the default Cá nhân template", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.applyTemplate("kinhDoanh"));
    expect(result.current.config.jars.length).toBe(3);

    act(() => result.current.resetToSeed());
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));
  });

  it("persists budgetLimit through the provider to storage", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.updateJar("food", { budgetLimit: 3_210_000 }));
    await waitFor(() => {
      const raw = window.localStorage.getItem("msb-pfm.jars.stable");
      const parsed = raw ? (JSON.parse(raw) as JarConfig) : null;
      expect(parsed?.jars.find((j) => j.id === "food")?.budgetLimit).toBe(3_210_000);
    });
    expect(result.current.config.jars.find((j) => j.id === "food")?.budgetLimit).toBe(3_210_000);
  });

  it("clears a jar's budgetLimit back to 'chưa đặt' (undefined, never 0)", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(6));

    act(() => result.current.updateJar("food", { budgetLimit: 3_210_000 }));
    await waitFor(() =>
      expect(result.current.config.jars.find((j) => j.id === "food")?.budgetLimit).toBe(3_210_000),
    );

    act(() => result.current.updateJar("food", { budgetLimit: undefined }));
    await waitFor(() => {
      const raw = window.localStorage.getItem("msb-pfm.jars.stable");
      const parsed = raw ? (JSON.parse(raw) as JarConfig) : null;
      expect(parsed?.jars.find((j) => j.id === "food")?.budgetLimit).toBeUndefined();
    });
    expect(result.current.config.jars.find((j) => j.id === "food")?.budgetLimit).toBeUndefined();
    expect(result.current.config.jars.find((j) => j.id === "food")?.budgetLimit).not.toBe(0);
  });

  it("dedupes an overlapping stored v3 config on load (never double-counts)", async () => {
    const overlapping: JarConfig = {
      version: 3,
      jars: [
        { id: "a", label: "A", categoryIds: ["dining", "shopping"] },
        { id: "b", label: "B", categoryIds: ["dining"] },
      ],
    };
    window.localStorage.setItem("msb-pfm.jars.stable", JSON.stringify(overlapping));

    const { result } = renderHook(() => useJarConfig(), { wrapper });
    // 2 authored jars + a healed "Khác" jar for the 8 orphaned expense categories.
    await waitFor(() => expect(result.current.config.jars.length).toBe(3));
    expect(holders(result.current.config, "dining")).toBe(1); // first jar keeps it
    expect(jarOf(result.current.config, "dining")).toBe("a");
  });

  it("heals orphan expense categories into the 'Khác' jar on load (exactly-one)", async () => {
    const partial: JarConfig = {
      version: 3,
      jars: [{ id: "a", label: "A", categoryIds: ["dining"] }],
    };
    window.localStorage.setItem("msb-pfm.jars.stable", JSON.stringify(partial));

    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.some((j) => j.id === "khac")).toBe(true));
    // Every expense category now belongs to exactly one jar.
    const khac = result.current.config.jars.find((j) => j.id === "khac");
    expect(khac?.categoryIds).toContain("housing");
    expect(khac?.budgetLimit).toBeUndefined(); // catch-all has no meaningful limit
    expect(holders(result.current.config, "dining")).toBe(1); // still just in "a"
  });

  it("loads a v3 config carrying budgetLimit unchanged — no reseed", async () => {
    const withLimits: JarConfig = {
      version: 3,
      jars: [
        // Covers every expense category (no heal), each with a set limit.
        {
          id: "all",
          label: "Tất cả",
          categoryIds: [
            "housing", "utilities", "subscriptions", "insurance", "dining",
            "transport", "shopping", "groceries", "entertainment", "health",
          ],
          budgetLimit: 9_000_000,
        },
      ],
    };
    window.localStorage.setItem("msb-pfm.jars.stable", JSON.stringify(withLimits));

    const { result } = renderHook(() => useJarConfig(), { wrapper });
    // Not reseeded to the 6-jar default and not healed (already complete).
    await waitFor(() => expect(result.current.config.jars.length).toBe(1));
    expect(result.current.config.jars[0].budgetLimit).toBe(9_000_000);
  });

  it("discards a stored legacy v1 config and reseeds v3 (migration)", async () => {
    window.localStorage.setItem(
      "msb-pfm.jars.stable",
      JSON.stringify({ version: 1, incomeBasis: "auto", jars: [{ id: "old", label: "Old", categoryIds: [], allocation: { mode: "percent", value: 50 } }] }),
    );
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.version).toBe(3));
    expect(result.current.config.jars.length).toBe(6); // reseeded default, not the v1 set
    expect(result.current.config.jars.some((j) => j.id === "old")).toBe(false);
  });

  it("migrates a stored legacy v2 config forward (allocation dropped, budgetLimit kept)", async () => {
    window.localStorage.setItem(
      "msb-pfm.jars.stable",
      JSON.stringify({
        version: 2,
        jars: [
          {
            id: "food",
            label: "Ăn uống",
            categoryIds: [
              "housing", "utilities", "subscriptions", "insurance", "dining",
              "transport", "shopping", "groceries", "entertainment", "health",
            ],
            allocation: { mode: "amount", value: 3_000_000 },
            budgetLimit: 4_000_000,
          },
        ],
      }),
    );
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.version).toBe(3));
    // Already covers every expense category → no heal, no reseed.
    expect(result.current.config.jars.length).toBe(1);
    expect(result.current.config.jars[0].budgetLimit).toBe(4_000_000);
    expect("allocation" in result.current.config.jars[0]).toBe(false);
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
