import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { CategoryTaxonomyProvider, useCategories } from "@/state/categories";
import { JarConfigProvider, useJarConfig } from "@/state/jars";
import type { Jar, JarConfig } from "@/domain/models";

/**
 * CategoryTaxonomyProvider over the real mock provider + the in-memory
 * `/api/categories` stand-in (vitest.setup), mounted inside JarConfigProvider
 * exactly as the app mounts it. Faults and latency are injected ONLY at the fetch
 * boundary, so the state logic under test (queueing, persona guard, jar handover)
 * runs for real.
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <JarConfigProvider>
        <CategoryTaxonomyProvider>{children}</CategoryTaxonomyProvider>
      </JarConfigProvider>
    </PersonaProvider>
  );
}

const useAll = () => ({ cats: useCategories(), jars: useJarConfig(), persona: usePersona() });
type Hook = Awaited<ReturnType<typeof renderLoaded>>;

type Handler = (url: string, init: RequestInit | undefined, real: typeof fetch) => Promise<Response> | null;

/** Route fetches through `handler` first; `null` falls back to the installed API stub. */
function interceptFetch(handler: Handler) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init, real) ?? real(input, init);
  });
}

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function renderLoaded() {
  const hook = renderHook(useAll, { wrapper });
  await waitFor(() => expect(hook.result.current.cats.loaded).toBe(true));
  await waitFor(() => expect(hook.result.current.jars.loaded).toBe(true));
  return hook;
}

const ids = (hook: Hook) => hook.result.current.cats.categories.map((c) => c.id);
const jarOf = (config: JarConfig, categoryId: string): Jar | undefined =>
  config.jars.find((j) => j.categoryIds.includes(categoryId));
/** Every category id claimed by a jar, WITH duplicates — the exactly-one probe. */
const claimed = (config: JarConfig) => config.jars.flatMap((j) => j.categoryIds);

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear(); // setPersona persists the choice
});

describe("CategoryTaxonomyProvider — load (U10, K03)", () => {
  it("loads the persona's taxonomy with no error", async () => {
    const hook = await renderLoaded();
    expect(hook.result.current.cats.error).toBeNull();
    expect(ids(hook)).toContain("dining");
    // `assignable` is the picker set: active EXPENSE only, so the system
    // "transfer" category can never be offered as a spending label.
    expect(hook.result.current.cats.assignable.map((c) => c.id)).not.toContain("transfer");
    expect(hook.result.current.cats.labels.get("dining")).toBe("Ăn uống");
  });

  it("exposes a load failure as `error` (never an empty-but-loaded taxonomy) and recovers on retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    interceptFetch((url, init) =>
      fail && url.startsWith("/api/categories") && (init?.method ?? "GET") === "GET"
        ? Promise.resolve(json({ error: "boom" }, 500))
        : null,
    );
    const hook = renderHook(useAll, { wrapper });
    await waitFor(() => expect(hook.result.current.cats.error).toMatch(/Không tải được danh mục/));
    expect(hook.result.current.cats.loaded).toBe(false);
    expect(hook.result.current.cats.categories).toEqual([]);

    fail = false;
    act(() => hook.result.current.cats.retry());
    await waitFor(() => expect(hook.result.current.cats.loaded).toBe(true));
    expect(hook.result.current.cats.error).toBeNull();
  });

  it("resets the taxonomy on a persona switch — one persona's custom category never leaks", async () => {
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.cats.addCategory({ label: "Học phí" });
    });
    expect(ids(hook)).toContain("c_hoc-phi");

    act(() => hook.result.current.persona.setPersona("irregular"));
    await waitFor(() => expect(hook.result.current.cats.loaded).toBe(true));
    expect(ids(hook)).not.toContain("c_hoc-phi");
    expect(ids(hook)).toContain("dining"); // the other persona's own seed is there
  });
});

describe("CategoryTaxonomyProvider — a write applies BOTH halves of the aggregate", () => {
  it("a create lands in the taxonomy AND in a hũ, with no second fetch", async () => {
    const hook = await renderLoaded();
    let ok = false;
    await act(async () => {
      ok = await hook.result.current.cats.addCategory({ label: "Học phí" });
    });
    expect(ok).toBe(true);
    expect(ids(hook)).toContain("c_hoc-phi");
    expect(hook.result.current.cats.assignable.map((c) => c.id)).toContain("c_hoc-phi");
    // The jar provider reflects the SAME response: the server healed the new
    // orphan into "Khác" and that config came back with the taxonomy.
    await waitFor(() => expect(jarOf(hook.result.current.jars.config, "c_hoc-phi")?.id).toBe("khac"));
  });

  it("a create with an explicit jarId lands in THAT hũ, and in exactly one", async () => {
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.cats.addCategory({ label: "Học phí", jarId: "savings" });
    });
    await waitFor(() => expect(jarOf(hook.result.current.jars.config, "c_hoc-phi")?.id).toBe("savings"));
    const all = claimed(hook.result.current.jars.config);
    expect(all.filter((id) => id === "c_hoc-phi")).toHaveLength(1);
  });

  it("a delete removes it from the taxonomy AND strips it from its hũ", async () => {
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.cats.addCategory({ label: "Học phí", jarId: "savings" });
    });
    await act(async () => {
      expect(await hook.result.current.cats.removeCategory("c_hoc-phi")).toBe(true);
    });
    expect(ids(hook)).not.toContain("c_hoc-phi");
    await waitFor(() => expect(jarOf(hook.result.current.jars.config, "c_hoc-phi")).toBeUndefined());
  });

  it("an archived category leaves `assignable` but KEEPS its label and its hũ", async () => {
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.cats.addCategory({ label: "Học phí", jarId: "savings" });
    });
    await act(async () => {
      expect(await hook.result.current.cats.setArchived("c_hoc-phi", true)).toBe(true);
    });
    const { cats, jars } = hook.result.current;
    expect(cats.assignable.map((c) => c.id)).not.toContain("c_hoc-phi");
    // Invariant #5: a transaction the user labelled last month must still render
    // that label, not a raw id — so the lookup keeps the archived row.
    expect(cats.labels.get("c_hoc-phi")).toBe("Học phí");
    expect(cats.byId.get("c_hoc-phi")?.archived).toBe(true);
    // Invariant #6: historical hũ totals never move when a category is hidden.
    expect(jarOf(jars.config, "c_hoc-phi")?.id).toBe("savings");
  });
});

describe("CategoryTaxonomyProvider — interleaving with a jar write (the double-count guard)", () => {
  /**
   * The one place this phase can break Σ-conservation. A category write answers
   * with its OWN copy of the hũ set; if that copy is painted on after a jar write
   * that the server handled later, the client's jars diverge from the server's —
   * the category the user just moved reads as still living in its old hũ.
   */
  it("does not clobber a jar write that landed after the category write was issued", async () => {
    const hook = await renderLoaded();
    // The server handles the POST first (the stub applies it on call), but its
    // RESPONSE is delivered last — the shape that makes the copy stale.
    interceptFetch((url, init, real) => {
      if (!url.startsWith("/api/categories") || init?.method !== "POST") return null;
      const res = real(url, init);
      return sleep(50).then(() => res);
    });

    let create: Promise<boolean> = Promise.resolve(false);
    let move: Promise<boolean> = Promise.resolve(false);
    act(() => {
      create = hook.result.current.cats.addCategory({ label: "Học phí" });
      move = hook.result.current.jars.assignCategory("dining", "savings");
    });
    await act(async () => {
      expect(await move).toBe(true);
      expect(await create).toBe(true);
    });

    // The client's hũ set equals the server's — the newer jar response survived.
    const stored = (await (await fetch("/api/jars?cif=CIF_0001")).json()) as JarConfig;
    expect(hook.result.current.jars.config).toEqual(stored);
    expect(jarOf(hook.result.current.jars.config, "dining")?.id).toBe("savings");
    // …and no category is claimed by two hũ (exactly-one, invariant #6).
    const all = claimed(hook.result.current.jars.config);
    expect(all).toHaveLength(new Set(all).size);
  });
});

describe("CategoryTaxonomyProvider — refused writes (U20)", () => {
  it("surfaces a duplicate label as mutationError and leaves the taxonomy untouched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.cats.addCategory({ label: "Học phí" });
    });
    const accepted = ids(hook);

    let ok = true;
    await act(async () => {
      ok = await hook.result.current.cats.addCategory({ label: "học phí" }); // case-folded clash
    });
    expect(ok).toBe(false);
    expect(hook.result.current.cats.mutationError).toMatch(/Tên danh mục đã tồn tại/);
    expect(ids(hook)).toEqual(accepted);

    act(() => hook.result.current.cats.clearMutationError());
    expect(hook.result.current.cats.mutationError).toBeNull();
  });

  it("refuses to rename a BUILT-IN category (403) and says why", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = await renderLoaded();
    let ok = true;
    await act(async () => {
      ok = await hook.result.current.cats.renameCategory("dining", "Ăn hàng");
    });
    expect(ok).toBe(false);
    expect(hook.result.current.cats.mutationError).toMatch(/danh mục mặc định/);
    expect(hook.result.current.cats.labels.get("dining")).toBe("Ăn uống");
  });

  it("refuses to DELETE a category still in use and reports the count (archive instead)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.cats.addCategory({ label: "Học phí" });
    });
    // One stored correction now points at it — exactly what the server counts.
    await fetch("/api/corrections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cif: "CIF_0001",
        changes: { "txn-1": { categoryId: "c_hoc-phi", origin: "user", status: "applied" } },
      }),
    });

    let ok = true;
    await act(async () => {
      ok = await hook.result.current.cats.removeCategory("c_hoc-phi");
    });
    expect(ok).toBe(false);
    expect(hook.result.current.cats.mutationError).toMatch(/đang dùng ở 1 giao dịch/);
    expect(ids(hook)).toContain("c_hoc-phi"); // last accepted state, untouched
  });
});
