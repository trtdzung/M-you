import "server-only";

import { eventsSince } from "./events";
import { ruleHandbook, profileGuideSteps } from "./handbook";
import { readProfile } from "./profile-store";
import { recoveryState } from "./recovery";
import { renderHubGuide, type Moment, type MomentContext } from "./scenarios";

const LARGE_BALANCE = 50_000_000;

/**
 * UC11 moments the matrix does not already cover: a weekly device-login
 * handbook, and a two-step Hub coach on first use, a large balance, or after
 * an incident. Emergency (an open incident) may repeat the handbook.
 */
export function educateMoments(cif: string, ctx: MomentContext, gauge: MomentContext["score"] = ctx.score): Moment[] {
  const out: Moment[] = [];
  if (ctx.trigger === "device_login") {
    const article = ruleHandbook("device_login");
    out.push({
      scenario: "EDU",
      key: "device_login",
      urgent: recoveryState(cif).incidentAt !== null,
      copy: { message: article.summary.join("\n"), question: null, chips: ["Link bài đầy đủ"], emphasis: [] },
    });
  }

  const fromGauge = gauge?.steps && gauge.steps.length >= 2 ? gauge.steps.slice(0, 2) : null;
  const steps = fromGauge ?? profileGuideSteps(readProfile(cif));
  if (steps.length < 2) return out;
  const copy = renderHubGuide(steps, fromGauge ? gauge?.total ?? null : null);

  if (ctx.trigger === "hub_open") {
    const opens = eventsSince(cif, 0, ["hub_open"]).filter(event => event.at <= ctx.now);
    if (opens.length <= 1) out.push({ scenario: "HUB", key: "first", copy });
    const incidentAt = recoveryState(cif).incidentAt;
    if (incidentAt !== null) out.push({ scenario: "HUB", key: `incident:${incidentAt}`, copy });
  }
  if (ctx.trigger === "incoming_credit" && (ctx.credit?.amount ?? 0) >= LARGE_BALANCE) {
    out.push({ scenario: "HUB", key: "balance", copy });
  }
  return out;
}
