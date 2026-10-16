import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import type { AssetFields } from "@/domain/models/asset-liability-input";
import { GoalProvider } from "@/state/goals";
import { AssetLiabilityProvider, useAssetLiabilities } from "../assets";
import { useFinancials } from "../useFinancials";

/**
 * Red-team #2 (live recompute — user records are context state in the `useMemo`,
 * not the stale one-time `raw` fetch), #3 (no double-count), #6 (unknown stays
 * unknown), #7 (no cross-persona data mid-switch).
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <CorrectionsProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <AssetLiabilityProvider>
            <GoalProvider>
              <PeriodProvider>{children}</PeriodProvider>
            </GoalProvider>
          </AssetLiabilityProvider>
        </JarConfigProvider>
        </ManualTxnsProvider>
    </CorrectionsProvider>
    </PersonaProvider>
  );
}

const cashAsset = (over: Partial<AssetFields> = {}): AssetFields => ({
  name: "Tài sản test",
  type: "cash",
  value: 10_000_000,
  note: null,
  ...over,
});

function renderState() {
  return renderHook(
    () => ({ al: useAssetLiabilities(), fin: useFinancials(), persona: usePersona() }),
    { wrapper },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("AssetLiabilityProvider — live net-worth recompute", () => {
  it("[#2/#3] add / edit / delete recompute net worth without a reload (no double-count)", async () => {
    const { result } = renderState();
    await waitFor(() => expect(result.current.fin.financials).not.toBeNull());
    const base = result.current.fin.financials!.networth.assetsTotal;

    // ADD — assetsTotal rises by exactly the value (counted once, not twice).
    act(() => result.current.al.createAsset(cashAsset({ value: 10_000_000 })));
    await waitFor(() =>
      expect(result.current.fin.financials!.networth.assetsTotal).toBe(base + 10_000_000),
    );
    const id = result.current.al.assets[0].id;
    const added = result.current.fin.financials!.networth.breakdown.filter((i) => i.id === id);
    expect(added).toHaveLength(1);
    expect(added[0].source).toBe("self_reported");

    // EDIT — recompute reflects the new value.
    act(() => result.current.al.updateAsset(id, cashAsset({ value: 4_000_000 })));
    await waitFor(() =>
      expect(result.current.fin.financials!.networth.assetsTotal).toBe(base + 4_000_000),
    );

    // DELETE — back to the seed-only baseline.
    act(() => result.current.al.deleteAsset(id));
    await waitFor(() =>
      expect(result.current.fin.financials!.networth.assetsTotal).toBe(base),
    );
  });

  it("[#6] a user asset with unknown valuation stays unknown, never 0", async () => {
    const { result } = renderState();
    await waitFor(() => expect(result.current.fin.financials).not.toBeNull());
    const base = result.current.fin.financials!.networth.assetsTotal;

    act(() => result.current.al.createAsset(cashAsset({ name: "Đất chưa định giá", value: null })));
    await waitFor(() => expect(result.current.al.assets).toHaveLength(1));

    const nw = result.current.fin.financials!.networth;
    expect(nw.assetsTotal).toBe(base); // unknown NOT summed as 0-or-otherwise
    expect(nw.hasUnknown).toBe(true);
    expect(nw.unknownFields).toContain("Đất chưa định giá");
  });

  it("[#7] no cross-persona data mid-switch; persists per persona (round-trip)", async () => {
    const { result } = renderState();
    await waitFor(() => expect(result.current.fin.financials).not.toBeNull());

    act(() => result.current.al.createAsset(cashAsset({ value: 3_000_000 })));
    await waitFor(() => expect(result.current.al.assets).toHaveLength(1));

    // Switch away → the switched-to persona shows NONE of stable's records.
    act(() => result.current.persona.setPersona("wealthy"));
    await waitFor(() => expect(result.current.al.assets).toHaveLength(0));

    // Switch back → stable's record is restored from its own persona key.
    act(() => result.current.persona.setPersona("stable"));
    await waitFor(() => expect(result.current.al.assets).toHaveLength(1));
    expect(result.current.al.assets[0].value).toBe(3_000_000);
  });

  it("[#4] surfaces a drop notice when the guard discards a corrupt stored record", async () => {
    // Pre-seed one valid + one malformed record under the stable persona key.
    window.localStorage.setItem(
      "msb-pfm.assets.stable",
      JSON.stringify({
        version: 1,
        records: [
          { id: "ok", type: "cash", name: "Hợp lệ", value: 1_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: "t", isEstimated: true },
          { id: "bad" },
        ],
      }),
    );

    const { result } = renderState();
    await waitFor(() => expect(result.current.al.assets).toHaveLength(1));
    expect(result.current.al.assets[0].id).toBe("ok"); // sibling survived
    expect(result.current.al.dropped).toBe(1);

    act(() => result.current.al.dismissDropNotice());
    expect(result.current.al.dropped).toBe(0);
  });
});
