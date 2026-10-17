import { describe, expect, it } from "vitest";
import { jarsLosingBalance } from "@/domain/jar-rules";
import type { Jar, JarConfig, JarLedgerEntry } from "@/domain/models";

/**
 * `jarsLosingBalance` backs the applyTemplate/resetToSeed confirm guard
 * (Red Team #11): a replace that drops a jar with ledger rows deletes its số dư.
 */

const jar = (id: string): Jar => ({ id, label: id.toUpperCase(), categoryIds: [], budgetLimit: 1_000_000 });
const row = (jarId: string, amount: number, isOpening = false): JarLedgerEntry => ({
  id: `${jarId}-${amount}`,
  jarId,
  kind: "deposit",
  amount,
  isOpening,
  createdAt: "2026-09-01T00:00:00.000Z",
  source: "self_reported",
});
const config = (ledger?: JarLedgerEntry[]): JarConfig => ({ version: 3, jars: [jar("a"), jar("b"), jar("c")], ledger });

describe("jarsLosingBalance", () => {
  it("lists removed jars that have ledger rows, in config order", () => {
    const cfg = config([row("c", 5_000), row("a", 1_000)]);
    expect(jarsLosingBalance(cfg, [jar("b")])).toEqual(["a", "c"]);
  });

  it("ignores kept jars even when funded", () => {
    expect(jarsLosingBalance(config([row("a", 1_000)]), [jar("a")])).toEqual([]);
  });

  it("ignores removed jars without any ledger row (nothing to lose)", () => {
    expect(jarsLosingBalance(config([row("a", 1_000)]), [jar("a"), jar("x")])).toEqual([]);
  });

  it("counts a 0 opening row: the jar has a known số dư that would be deleted", () => {
    expect(jarsLosingBalance(config([row("b", 0, true)]), [])).toEqual(["b"]);
  });

  it("returns [] when the config carries no ledger", () => {
    expect(jarsLosingBalance(config(undefined), [])).toEqual([]);
  });
});
