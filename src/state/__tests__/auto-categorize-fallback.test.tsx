import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { categorize } from "@/ai/categorize/categorize-service";
import { createRemoteClassify } from "@/ai/categorize/remote-classifier";
import { createLocalClassify } from "@/ai/categorize/local-classifier";
import { txn } from "@/domain/engine/__tests__/helpers";
import { CATEGORIES, UNCLASSIFIED } from "@/domain/models";

/**
 * Coverage of the orchestrator's AI -> heuristic fallback wiring
 * (`src/state/auto-categorize.tsx`'s `run()`, roughly lines 116-144), exercised
 * via the REAL production functions in the exact sequence the orchestrator
 * runs them, rather than through a full React/DOM render.
 *
 * Rationale (documented choice, per task instructions): a full provider-stack
 * render would need to stub `fetch` selectively by URL while letting
 * `JarConfigProvider`'s own same-origin calls (which ALSO fail against jsdom's
 * fake network with no server) resolve the way those providers gracefully
 * degrade internally. That exact plumbing is already
 * rendered end to end by `src/components/transactions/__tests__/
 * auto-categorize-accept.test.tsx` (existing, untouched), which asserts the
 * heuristic badge/copy after the same offline-fetch fallback fires. Re-deriving
 * that same plumbing here would just be a slower, more fragile duplicate of
 * that test. Instead this file proves the underlying fallback CONTRACT
 * directly: given a remote classify that throws for every chunk
 * (offline/no-key/502/truncated-response, per `remote-classifier.ts`),
 * `categorize()` reports `chunkErrors > 0` and produces NO "ai" assignments,
 * and re-running `categorize()` with `localClassify` for the leftover txns
 * (exactly what `auto-categorize.tsx` does next) yields `origin: "heuristic"`
 * assignments — the same two calls, in the same order, against the same real
 * modules the orchestrator uses.
 */

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable (simulated offline)")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const un = (over: Parameters<typeof txn>[0] = {}) => txn({ categoryId: UNCLASSIFIED, type: "expense", ...over });

/**
 * The persona's taxonomy — the bundled presets stand in for it. Both the
 * heuristic's filter and the service's whitelist read from this ONE list, which
 * is what the orchestrator does with `useCategories().assignable`.
 */
const TAXONOMY = CATEGORIES;
const ASSIGNABLE = new Set(TAXONOMY.filter((c) => c.kind === "expense").map((c) => c.id));
const localClassify = createLocalClassify(ASSIGNABLE);

describe("auto-categorize AI -> heuristic fallback contract (src/state/auto-categorize.tsx orchestration)", () => {
  it("remote classify throwing for every chunk yields chunkErrors>0 and NO ai assignments", async () => {
    const txns = [un({ id: "a", merchantNormalizedName: "highlands coffee" })];
    const remote = createRemoteClassify("CIF_0001");

    const out = await categorize({ txns, memory: {}, categories: TAXONOMY, classify: remote, classifyOrigin: "ai" });

    expect(out.chunkErrors).toBe(1);
    expect(out.assignments).toHaveLength(0);
  });

  it("falls back to the local heuristic for the leftover txns, honestly tagged origin: heuristic", async () => {
    const txns = [
      un({ id: "known", merchantNormalizedName: "highlands coffee" }), // heuristic recognizes "coffee"/"highlands"
      un({ id: "unknown", merchantNormalizedName: "totally unrecognized merchant xyz" }),
    ];
    const remote = createRemoteClassify("CIF_0001");

    // Step 1 — exactly what auto-categorize.tsx's run() does first (aiConsent path).
    const aiOutcome = await categorize({ txns, memory: {}, categories: TAXONOMY, classify: remote, classifyOrigin: "ai" });
    expect(aiOutcome.chunkErrors).toBeGreaterThan(0);
    const done = new Set(aiOutcome.assignments.map((a) => a.txnId));
    const leftover = txns.filter((t) => !done.has(t.id));
    expect(leftover).toHaveLength(2); // nothing was AI-assigned — both txns are still leftover

    // Step 2 — the fallback call, using the REAL local heuristic (no network).
    const fbOutcome = await categorize({
      txns: leftover,
      memory: {},
      categories: TAXONOMY,
      classify: localClassify,
      classifyOrigin: "heuristic",
    });

    const known = fbOutcome.assignments.find((a) => a.txnId === "known");
    expect(known).toBeDefined();
    expect(known?.origin).toBe("heuristic");
    expect(known?.categoryId).toBe("dining");
    expect(known?.status).toBe("pending"); // heuristic confidence (0.5) is always below the default 0.8 gate

    // The unrecognized merchant never gets a fabricated category (invariant #6).
    expect(fbOutcome.assignments.some((a) => a.txnId === "unknown")).toBe(false);

    // A heuristic guess must never be mislabelled as "ai" (Red Team #9).
    expect(fbOutcome.assignments.every((a) => a.origin === "heuristic")).toBe(true);
  });

  it("createRemoteClassify itself throws on a fetch rejection (does not silently swallow it)", async () => {
    const remote = createRemoteClassify("CIF_0001");
    await expect(
      remote([{ txnId: "a", merchant: "x", amount: 1, direction: "debit", type: "expense" }]),
    ).rejects.toThrow(/network unreachable/);
  });
});
