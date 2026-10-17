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
    // A limit edit no longer trips the balance-lens cap (plan 260923), so the 422
    // is injected at the fetch boundary to pin the reason → message mapping.
    interceptFetch((url, init) =>
      isPatch(url, init) ? Promise.resolve(json({ error: "over CASA cap", overBy: 30_886_000 }, 422)) : null,
    );
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.jars.updateJar("food", { budgetLimit: 50_000_000 });
    });
    expect(hook.result.current.jars.mutationError).toMatch(/Vượt số dư 30\.886\.000/);
    expect(jarById(hook, "food")?.budgetLimit).toBe(4_000_000);
  });

  it("a LIMIT raise past CASA persists — limits move no balance (plan 260923)", async () => {
    const hook = await renderLoaded();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.updateJar("food", { budgetLimit: 50_000_000 });
    });
    expect(ok).toBe(true);
    expect(hook.result.current.jars.mutationError).toBeNull();
    expect(jarById(hook, "food")?.budgetLimit).toBe(50_000_000);
  });

});

const ledgerOf = (hook: Awaited<ReturnType<typeof renderLoaded>>) => hook.result.current.jars.config.ledger ?? [];

describe("JarConfigProvider — balances (plan 260923)", () => {
  it("addJar sends the opening balance; 0 is stored as a known 0 opening row", async () => {
    const hook = await renderLoaded();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.addJar(
        { id: "jar-travel", label: "Du lịch", categoryIds: [], budgetLimit: 2_000_000 },
        0,
      );
    });
    expect(ok).toBe(true);
    expect(jarById(hook, "jar-travel")?.budgetLimit).toBe(2_000_000);
    const opening = ledgerOf(hook).filter((e) => e.jarId === "jar-travel");
    expect(opening).toEqual([expect.objectContaining({ kind: "deposit", amount: 0, isOpening: true })]);
  });

  it("postLedger writes a multi-jar batch that survives a reload (persisted, not session-only)", async () => {
    const hook = await renderLoaded();
    const before = ledgerOf(hook).length;
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.postLedger([
        { jarId: "food", kind: "deposit", amount: 10_000 },
        { jarId: "transport", kind: "deposit", amount: 20_000 },
      ]);
    });
    expect(ok).toBe(true);
    expect(hook.result.current.jars.mutationError).toBeNull();
    expect(ledgerOf(hook)).toHaveLength(before + 2);
    const stored = (await (await fetch("/api/jars?cif=CIF_0001")).json()) as JarConfig;
    expect(stored.ledger?.filter((e) => !e.isOpening).map((e) => [e.jarId, e.amount])).toEqual([
      ["food", 10_000],
      ["transport", 20_000],
    ]);
  });

  it("a withdraw over the balance is refused with 'Chỉ rút tối đa' and the WHOLE batch is dropped", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = await renderLoaded();
    const before = ledgerOf(hook).length;
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.postLedger([
        { jarId: "food", kind: "deposit", amount: 10_000 },
        { jarId: "transport", kind: "withdraw", amount: 900_000_000 },
      ]);
    });
    expect(ok).toBe(false);
    expect(hook.result.current.jars.mutationError).toMatch(/^Chỉ rút tối đa \d/);
    expect(ledgerOf(hook)).toHaveLength(before);
    const stored = (await (await fetch("/api/jars?cif=CIF_0001")).json()) as JarConfig;
    expect(stored.ledger).toHaveLength(before);
  });

  it("maps an over-cap batch to the server's exact overBy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    interceptFetch((url) =>
      url.startsWith("/api/jar-ledger") ? Promise.resolve(json({ error: "over CASA cap", overBy: 1_250_000 }, 422)) : null,
    );
    const hook = await renderLoaded();
    await act(async () => {
      await hook.result.current.jars.postLedger([{ jarId: "food", kind: "deposit", amount: 5_000_000 }]);
    });
    expect(hook.result.current.jars.mutationError).toMatch(/Vượt số dư 1\.250\.000/);
  });
});

describe("JarConfigProvider — template replace guard (Red Team #11)", () => {
  it("refuses applyTemplate without confirmation when it would delete funded jars", async () => {
    const hook = await renderLoaded();
    const puts = vi.fn();
    interceptFetch((url, init) => {
      if (url.startsWith("/api/jars") && init?.method === "PUT") puts();
      return null;
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.applyTemplate("giaDinh");
    });
    expect(ok).toBe(false);
    expect(puts).not.toHaveBeenCalled();
    expect(hook.result.current.jars.mutationError).toMatch(/Áp mẫu sẽ xoá 5 hũ đang có số dư \(Thiết yếu, Ăn uống/);
    expect(jarById(hook, "food")).toBeDefined();
  });

  it("applies it with confirmedBalanceLoss: new jars have no balance until a deposit", async () => {
    const hook = await renderLoaded();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.applyTemplate("giaDinh", { confirmedBalanceLoss: true });
    });
    expect(ok).toBe(true);
    expect(jarById(hook, "household")).toBeDefined();
    expect(jarById(hook, "food")).toBeUndefined();
    expect(ledgerOf(hook)).toEqual([]); // D3: no auto-seeded deposit
  });

  it("resetToSeed needs no confirmation when no funded jar is removed", async () => {
    const hook = await renderLoaded();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.result.current.jars.resetToSeed();
    });
    expect(ok).toBe(true);
    expect(hook.result.current.jars.mutationError).toBeNull();
  });
});
