/**
 * Public contract of the jar-config state (`./jars`), split out so the provider
 * file stays focused on the queue/guard mechanics.
 */

import type { Jar, JarConfig, JarLedgerInput } from "@/domain/models";
import type { JarTemplate } from "@/domain/models/jar-defaults";

export type JarPatch = Partial<Omit<Jar, "id">>;

/** Options for a full-set replace that may delete funded jars (Red Team #11). */
export interface ReplaceJarsOptions {
  /** The user confirmed that the replace deletes jars that still hold a balance. */
  confirmedBalanceLoss?: boolean;
}

export interface JarConfigContextValue {
  config: JarConfig;
  /**
   * False until the first fetch for the current persona resolves. The transfer
   * flow must not compute the unallocated pool or classify "insufficient" while
   * jars are still empty-by-loading (would misread `jars: []` — RT#14).
   */
  loaded: boolean;
  /** Non-null (VN copy) when the load for the current persona failed; reset on persona switch/retry. */
  error: string | null;
  /** Re-run the load for the current persona (clears `error`). */
  retry: () => void;
  /** VN reason of the latest failed write (incl. the server's 422 over-cap); null once a write succeeds. */
  mutationError: string | null;
  clearMutationError: () => void;
  /**
   * Mutators resolve `true` when the write was applied, `false` when it failed (see
   * `mutationError`). `addJar` creates a jar with its REQUIRED limit
   * (`jar.budgetLimit`) and opening balance (≥ 0).
   */
  addJar: (jar: Jar, balance: number) => Promise<boolean>;
  updateJar: (id: string, patch: JarPatch) => Promise<boolean>;
  /**
   * Deposit/withdraw jar balances in ONE atomic batch (1 entry for a single jar,
   * many for "Chia ngay"). All-or-nothing server-side; a refusal (over CASA cap,
   * over a jar's balance) resolves `false` with the reason in `mutationError`.
   */
  postLedger: (entries: JarLedgerInput[]) => Promise<boolean>;
  /** Remove a jar outright; its categories become "chưa xếp hũ" and its rebalance legs are deleted server-side. */
  removeJar: (id: string) => Promise<boolean>;
  /** Move a category into `jarId`. `jarId === null` is a no-op (exactly-one). */
  assignCategory: (categoryId: string, jarId: string | null) => Promise<boolean>;
  /**
   * REPLACE the whole jar set with a template's. When the replace would delete
   * jars that hold a balance (`jarsLosingBalance`), it is REFUSED (`false` +
   * `mutationError` = `balanceLossPrompt`) unless `confirmedBalanceLoss` — any UI
   * wiring this must render that confirmation first (Red Team #11).
   */
  applyTemplate: (templateId: JarTemplate["id"], opts?: ReplaceJarsOptions) => Promise<boolean>;
  resetToSeed: (opts?: ReplaceJarsOptions) => Promise<boolean>;
  /**
   * Opaque marker of the config currently held: capture it BEFORE issuing a write
   * on another resource and hand it back to `applyServerConfig` below. Two configs
   * carry no version we could compare, so this counter is the only "newer" test.
   */
  configToken: () => number;
  /**
   * Apply a `JarConfig` returned by a write on ANOTHER resource — a category
   * create/delete re-homes categories, so `/api/categories*` answers with the
   * whole aggregate. It runs through the SAME serial queue and the SAME persona
   * guard as a jar write, so a second copy of the jar config can never be painted
   * on out of band (that is how a category ends up in two hũ client-side and
   * `evaluateJarBudget` double-counts its spend — Σ-conservation, invariant #6).
   *
   * `since` is the `configToken()` taken when the other write was ISSUED. If any
   * jar response has been applied since then, that one is newer and this copy is
   * DROPPED rather than clobbering it. Resolves once the decision is made.
   */
  applyServerConfig: (config: JarConfig, since?: number) => Promise<void>;
}
