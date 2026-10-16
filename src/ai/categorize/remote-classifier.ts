/**
 * Remote classifier — calls the same-origin proxy `/api/agent/categorize`, which
 * forwards to the server-side LLM (GreenNode). The browser NEVER holds the API
 * key; it only sees this route.
 *
 * `createRemoteClassify(userId)` binds the caller's id (cif) into a `ClassifyFn`.
 * A non-2xx response (incl. 501 "offline" when no model is configured) THROWS so
 * the caller's chunk is isolated and the orchestrator can degrade to the local
 * heuristic (`auto-categorize.tsx`). The returned rows are shape-filtered but not
 * trusted — `categorize-service` re-validates every categoryId (the model is
 * untrusted: invariant #7).
 */

import type { ClassifyFn, ClassifyResult } from "./types";

const PROXY_PATH = "/api/agent/categorize";

interface RawResult {
  txnId?: unknown;
  categoryId?: unknown;
  confidence?: unknown;
}

export type ClassifyMode = "spending" | "transfer_purpose";

export function createRemoteClassify(userId: string, mode: ClassifyMode = "spending"): ClassifyFn {
  return async (inputs) => {
    const res = await fetch(PROXY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, items: inputs, mode }),
    });
    if (!res.ok) throw new Error(`categorize proxy ${res.status}`);
    const data = (await res.json()) as { results?: RawResult[] };
    const results = Array.isArray(data.results) ? data.results : [];
    const out: ClassifyResult[] = [];
    for (const r of results) {
      if (typeof r.txnId !== "string" || typeof r.categoryId !== "string") continue;
      const confidence = typeof r.confidence === "number" ? r.confidence : 0;
      out.push({ txnId: r.txnId, categoryId: r.categoryId, confidence });
    }
    // Sent a non-empty batch but got nothing usable back (e.g. a truncated
    // JSON body that still returned 200): treat it as a failure so the caller's
    // chunk counts as an error and degrades to the local heuristic, rather than
    // silently producing no suggestions.
    if (inputs.length > 0 && out.length === 0) {
      throw new Error("categorize proxy returned no usable results");
    }
    return out;
  };
}
