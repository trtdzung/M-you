import { createHash } from "node:crypto";
import type { ProactiveCandidate } from "./core";

/** Canonical object encoding for stable signatures independent of key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** `customerKey` must be an authenticated, server-resolved tenant/persona key. */
export function featureFingerprint(customerKey: string, ruleVersion: string, c: ProactiveCandidate): string {
  return sha256({ customerKey, ruleVersion, id: c.id, period: c.period, insightType: c.insightType,
    priorityClass: c.priorityClass, severity: c.severity, semanticState: c.semanticState,
    action: c.action, metrics: c.metrics });
}

/** Copy has no embedded numbers; numeric facts remain separate widget metrics. */
export function semanticSignature(ruleVersion: string, c: ProactiveCandidate): string {
  return sha256({ ruleVersion, id: c.id, insightType: c.insightType, priorityClass: c.priorityClass,
    severity: c.severity, semanticState: c.semanticState, action: c.action,
    period: c.period, label: c.metrics.jar_label ?? c.metrics.obligation_label ?? c.metrics.category_label ?? null,
    source: c.metrics.source ?? null, productIds: c.metrics.product_ids ?? null });
}

export type CacheDecision = "exact_reuse" | "copy_reuse" | "new_version";

/** A same-state copy may be reused only when it has passed the no-embedded-facts validator. */
export function decideCache(
  previous: { fingerprint: string; semanticSignature: string; reusableCopy: boolean } | null,
  next: { fingerprint: string; semanticSignature: string },
): CacheDecision {
  if (previous?.fingerprint === next.fingerprint) return "exact_reuse";
  if (previous?.semanticSignature === next.semanticSignature && previous.reusableCopy) return "copy_reuse";
  return "new_version";
}
