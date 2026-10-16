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

describe("JarConfigProvider CRUD", () => {
  it("seeds the default template on first load", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(3));
    expect(jarOf(result.current.config, "dining")).toBe("dining");
  });

  it("assignCategory moves a category and keeps it in exactly one jar", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(3));

    act(() => result.current.assignCategory("dining", "essentials"));
    expect(jarOf(result.current.config, "dining")).toBe("essentials");
    expect(holders(result.current.config, "dining")).toBe(1);

    act(() => result.current.assignCategory("dining", null));
    expect(holders(result.current.config, "dining")).toBe(0);
  });

  it("updateJar overwriting categoryIds strips the prior owner", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(3));

    act(() => result.current.updateJar("dining", { categoryIds: ["shopping"] }));
    expect(jarOf(result.current.config, "shopping")).toBe("dining");
    expect(holders(result.current.config, "shopping")).toBe(1);
  });

  it("addJar steals a category from any jar that already had it", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(3));

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

  it("persists mutations through the provider to storage", async () => {
    const { result } = renderHook(() => useJarConfig(), { wrapper });
    await waitFor(() => expect(result.current.config.jars.length).toBe(3));

    act(() => result.current.setIncomeBasis(12_345_000));
    await waitFor(() => {
      const raw = window.localStorage.getItem("msb-pfm.jars.stable");
      expect(raw && (JSON.parse(raw) as JarConfig).incomeBasis).toBe(12_345_000);
    });
  });

  it("dedupes an overlapping stored config on load (never double-counts)", async () => {
    // A structurally-valid but overlapping config that never went through the mutators.
    const overlapping: JarConfig = {
      version: 1,
      incomeBasis: "auto",
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

  it("reloads per persona on switch — config never leaks across personas (H5)", async () => {
    const { result } = renderHook(
      () => ({ jars: useJarConfig(), persona: usePersona() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.jars.config.jars.length).toBe(3));

    act(() => result.current.jars.setIncomeBasis(9_999_000));
    expect(result.current.jars.config.incomeBasis).toBe(9_999_000);

    act(() => result.current.persona.setPersona("wealthy"));
    await waitFor(() => expect(result.current.jars.config.incomeBasis).toBe("auto")); // wealthy = fresh seed

    act(() => result.current.persona.setPersona("stable"));
    await waitFor(() => expect(result.current.jars.config.incomeBasis).toBe(9_999_000)); // restored
  });
});
