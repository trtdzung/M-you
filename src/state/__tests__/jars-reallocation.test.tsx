import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { JarConfigProvider, useJarConfig } from "@/state/jars";
import { POOL_DONOR_ID } from "@/domain/engine";

/**
 * `applyReallocation` (src/state/jars.tsx) — the ONE-batch top-up mutator behind
 * the funding decision tree. Exercised over the real provider stack (the global
 * `/api/jars*` fetch stub from vitest.setup.ts) so the batching mechanic itself
 * (not just the pure `jar-funding` math, already covered) is load-bearing:
 * a jar-source chain merges donor decrements + one target credit into a SINGLE
 * `updateJars` call, a pool-source chain writes only donor decrements, a donor
 * that would go negative hard-fails BEFORE any write, and the "pool" sentinel
 * never becomes a patch entry of its own.
 *
 * Seed jars (Cá nhân template, DEFAULT_JAR_CONFIG, actualAmount backfilled from
 * budgetLimit): essentials 8tr, food 4tr, transport 1.5tr, lifestyle 2.5tr,
 * health 1tr, savings (no limit → actualAmount undefined/0).
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <JarConfigProvider>{children}</JarConfigProvider>
    </PersonaProvider>
  );
}

function renderJars() {
  return renderHook(() => useJarConfig(), { wrapper });
}

function actualOf(jars: { id: string; actualAmount?: number }[], id: string): number {
  return jars.find((j) => j.id === id)?.actualAmount ?? 0;
}

/** Every PATCH /api/jars BATCH call (not the per-jar `/api/jars/:id` route). */
function batchPatchCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([input, init]) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    return url.startsWith("/api/jars?") && (init as RequestInit | undefined)?.method === "PATCH";
  });
}

// Loosely typed on purpose: `globalThis.fetch`'s overloaded signature makes a
// precisely-typed `MockInstance` awkward to pre-declare across `it` blocks; this
// spy is only ever used to inspect call args (url/init), never invoked directly.
// Loosely typed (`any`): `vi.spyOn(globalThis, "fetch")`'s overloaded return type
// resists a concise annotation, and this spy is only read for call args. The
// project's ESLint config does not register `no-explicit-any`, so no directive.
let fetchSpy: any;

beforeEach(() => {
  window.localStorage.clear();
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("applyReallocation — one atomic batch", () => {
  it("jar-source topup: pool + one jar donor + target credit → ONE batch with exactly the donor and target patches", async () => {
    const { result } = renderJars();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await result.current.applyReallocation({
      donors: [
        { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 1_000_000 },
        { jarId: "food", label: "Hũ food", take: 500_000 },
      ],
      targetJarId: "essentials",
    });

    await waitFor(() => expect(actualOf(result.current.config.jars, "essentials")).toBe(9_500_000));
    expect(actualOf(result.current.config.jars, "food")).toBe(3_500_000);
    // Untouched jars keep their seed balance.
    expect(actualOf(result.current.config.jars, "transport")).toBe(1_500_000);
    expect(actualOf(result.current.config.jars, "health")).toBe(1_000_000);

    const calls = batchPatchCalls(fetchSpy);
    expect(calls).toHaveLength(1); // single write, never pairwise
    const body = JSON.parse((calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body.patches).sort()).toEqual(["essentials", "food"]);
    expect(body.patches.essentials.actualAmount).toBe(9_500_000);
    expect(body.patches.food.actualAmount).toBe(3_500_000);
  });

  it("pool-source topup: donors decrement, NO target credit patch", async () => {
    const { result } = renderJars();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await result.current.applyReallocation({
      donors: [{ jarId: "transport", label: "Hũ transport", take: 300_000 }],
      targetJarId: null,
    });

    await waitFor(() => expect(actualOf(result.current.config.jars, "transport")).toBe(1_200_000));
    // No other jar moved (no target to credit).
    expect(actualOf(result.current.config.jars, "essentials")).toBe(8_000_000);
    expect(actualOf(result.current.config.jars, "food")).toBe(4_000_000);

    const calls = batchPatchCalls(fetchSpy);
    expect(calls).toHaveLength(1);
    const body = JSON.parse((calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body.patches)).toEqual(["transport"]);
    expect(body.patches.transport.actualAmount).toBe(1_200_000);
  });

  it("hard-fails BEFORE any write when a donor would go negative (RT#6)", async () => {
    const { result } = renderJars();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(
      result.current.applyReallocation({
        donors: [{ jarId: "health", label: "Hũ health", take: 2_000_000 }], // health only has 1tr
        targetJarId: "essentials",
      }),
    ).rejects.toThrow(/would go negative/);

    // Nothing was written: no batch PATCH call, config unchanged.
    expect(batchPatchCalls(fetchSpy)).toHaveLength(0);
    expect(actualOf(result.current.config.jars, "health")).toBe(1_000_000);
    expect(actualOf(result.current.config.jars, "essentials")).toBe(8_000_000);
  });

  it('the "pool" donor never produces a patch entry of its own', async () => {
    const { result } = renderJars();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await result.current.applyReallocation({
      donors: [{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 500_000 }],
      targetJarId: "food",
    });

    await waitFor(() => expect(actualOf(result.current.config.jars, "food")).toBe(4_500_000));
    const calls = batchPatchCalls(fetchSpy);
    expect(calls).toHaveLength(1);
    const body = JSON.parse((calls[0][1] as RequestInit).body as string);
    // Only the credited target — "pool" is derived, never a real jar row.
    expect(Object.keys(body.patches)).toEqual(["food"]);
    expect(body.patches.pool).toBeUndefined();
  });
});
