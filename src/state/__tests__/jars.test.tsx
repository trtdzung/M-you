import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { JarConfigProvider, useJarConfig } from "@/state/jars";
import type { JarConfig } from "@/domain/models";

/**
 * JarConfigProvider over the real mock provider + the in-memory `/api/jars`
 * stand-in (vitest.setup). Faults/latency are injected ONLY at the fetch
 * boundary, so the state logic under test (queueing, persona guard, error
 * surfacing) runs for real.
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <JarConfigProvider>{children}</JarConfigProvider>
    </PersonaProvider>
  );
}

const useBoth = () => ({ jars: useJarConfig(), persona: usePersona() });

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
const isPatch = (url: string, init?: RequestInit) => url.startsWith("/api/jars/") && init?.method === "PATCH";

async function renderLoaded() {
  const hook = renderHook(useBoth, { wrapper });
  await waitFor(() => expect(hook.result.current.jars.loaded).toBe(true));
  return hook;
}

const jarById = (hook: Awaited<ReturnType<typeof renderLoaded>>, id: string) =>
  hook.result.current.jars.config.jars.find((j) => j.id === id);

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear(); // setPersona persists the choice
});

describe("JarConfigProvider — load (U10)", () => {
  it("loads the persona's jars with no error", async () => {
    const hook = await renderLoaded();
    expect(hook.result.current.jars.error).toBeNull();
    expect(hook.result.current.jars.config.jars.length).toBeGreaterThan(0);
  });

  it("exposes a load failure as `error` (never an empty-but-loaded config) and recovers on retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    interceptFetch((url, init) =>
      fail && url.startsWith("/api/jars") && (init?.method ?? "GET") === "GET"
        ? Promise.resolve(json({ error: "boom" }, 500))
        : null,
    );
    const hook = renderHook(useBoth, { wrapper });
    await waitFor(() => expect(hook.result.current.jars.error).toMatch(/Không tải được/));
    expect(hook.result.current.jars.loaded).toBe(false);
    expect(hook.result.current.jars.config.jars).toEqual([]);

    fail = false;
    act(() => hook.result.current.jars.retry());
    await waitFor(() => expect(hook.result.current.jars.loaded).toBe(true));
    expect(hook.result.current.jars.error).toBeNull();
  });
});

describe("JarConfigProvider — ordering (U13/K04, K03)", () => {
  it("final state = LAST click even when earlier responses would arrive later", async () => {
    const hook = await renderLoaded();
    // Earlier requests are slower: unsequenced, the first click would land last.
    const delays = [60, 40, 20, 1];
    let n = 0;
    interceptFetch((url, init, real) => {
      if (!isPatch(url, init)) return null;
      const d = delays[n++] ?? 0;
      return sleep(d).then(() => real(url, init));
    });
    const labels = ["A", "B", "C", "D"] as const;
    let done: Promise<boolean[]> = Promise.resolve([]);
    act(() => {
      done = Promise.all(labels.map((label) => hook.result.current.jars.updateJar("food", { label })));
    });
    await act(async () => {
      expect(await done).toEqual([true, true, true, true]);
    });
    expect(jarById(hook, "food")?.label).toBe("D");
    // The server (store) agrees with the UI — writes reached it in click order.
    const stored = await (await fetch("/api/jars?cif=CIF_0001")).json();
    expect(stored.jars.find((j: { id: string }) => j.id === "food").label).toBe("D");
  });

  it("drops a mutation response that belongs to the previous persona", async () => {
    const hook = await renderLoaded();
    const original = jarById(hook, "food")?.label;
    interceptFetch((url, init, real) => (isPatch(url, init) ? sleep(40).then(() => real(url, init)) : null));
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = hook.result.current.jars.updateJar("food", { label: "Đổi tên cũ" });
      hook.result.current.persona.setPersona("irregular");
    });
    await act(async () => {
      expect(await pending).toBe(false);
    });
    await waitFor(() => expect(hook.result.current.jars.loaded).toBe(true));
    expect(jarById(hook, "food")?.label).toBe(original);
  });
});

describe("JarConfigProvider — applyServerConfig (a write on another resource)", () => {
  it("applies a config handed over by another resource, in queue order", async () => {
    const hook = await renderLoaded();
    const handed: JarConfig = {
      version: 3,
      jars: [{ id: "khac", label: "Khác", categoryIds: ["dining", "c_hoc-phi"] }],
    };
    await act(async () => {
      await hook.result.current.jars.applyServerConfig(handed);
    });
    expect(hook.result.current.jars.config).toEqual(handed);
  });

  it("DROPS it when a jar response landed after the other write was issued", async () => {
    const hook = await renderLoaded();
    // The token says which config the hand-over was derived from.
    const since = hook.result.current.jars.configToken();
    await act(async () => {
      await hook.result.current.jars.updateJar("food", { label: "Ăn uống (mới)" });
    });
    const afterJarWrite = hook.result.current.jars.config;

    await act(async () => {
      await hook.result.current.jars.applyServerConfig({ version: 3, jars: [] }, since);
    });
    // The jar response is newer truth; the stale copy never lands (it would have
    // wiped every jar here — the visible form of the same clobber).
    expect(hook.result.current.jars.config).toBe(afterJarWrite);
  });

  it("drops a hand-over that belongs to the previous persona (K03)", async () => {
    const hook = await renderLoaded();
    let handed: Promise<void> = Promise.resolve();
    act(() => {
      handed = hook.result.current.jars.applyServerConfig({ version: 3, jars: [] });
      hook.result.current.persona.setPersona("irregular");
    });
    await act(async () => {
      await handed;
    });
    await waitFor(() => expect(hook.result.current.jars.loaded).toBe(true));
    // The new persona's own jars stand; the previous persona's copy never lands.
    expect(hook.result.current.jars.config.jars.length).toBeGreaterThan(0);
  });
});

describe("JarConfigProvider — mutation errors (U20/S14/K02)", () => {
  it("surfaces a 500 as mutationError, keeps the persisted value, clears on next success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = await renderLoaded();
    let fail = true;
    interceptFetch((url, init) => (fail && isPatch(url, init) ? Promise.resolve(json({ error: "db down" }, 500)) : null));
    let ok = true;
    await act(async () => {
      ok = await hook.result.current.jars.updateJar("food", { label: "Ăn ngoài" });
    });
    expect(ok).toBe(false);
    expect(hook.result.current.jars.mutationError).toMatch(/Không lưu được/);
    expect(jarById(hook, "food")?.label).toBe("Ăn uống");

    fail = false;
    await act(async () => {
      ok = await hook.result.current.jars.updateJar("food", { label: "Ăn ngoài" });
    });
    expect(ok).toBe(true);
    expect(hook.result.current.jars.mutationError).toBeNull();
    expect(jarById(hook, "food")?.label).toBe("Ăn ngoài");
  });

  it("shows the server's over-cap reason with its overBy amount", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = await renderLoaded();
    // BALANCE LENS: overBy = Σ new spendable − CASA. Setting food (limit 4tr, its
    // spendable already reduced by this month's dining spend) to 50tr raises Σ
    // spendable to 30,886,000 over CASA — less than the 45tr a pure-limit cap would
    // report, because spent money no longer counts as claimed.
    await act(async () => {
      await hook.result.current.jars.updateJar("food", { budgetLimit: 50_000_000 });
    });
    expect(hook.result.current.jars.mutationError).toMatch(/Vượt số dư 30\.886\.000/);
    expect(jarById(hook, "food")?.budgetLimit).toBe(4_000_000);
  });

  it("updateJars rejects to its caller and leaves mutationError alone", async () => {
    const hook = await renderLoaded();
    await act(async () => {
      await expect(hook.result.current.jars.updateJars({ food: { budgetLimit: 90_000_000 } })).rejects.toThrow(/422/);
    });
    expect(hook.result.current.jars.mutationError).toBeNull();
  });
});
