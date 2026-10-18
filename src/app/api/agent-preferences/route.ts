import { NextRequest, NextResponse } from "next/server";
import { readAgentPreferences, sanitizeAgentPreferences, writeAgentPreferences } from "@/lib/agent-preferences-store";

/**
 * The customer's standing instructions for M-You (`data/schema.md`
 * `agent_preferences`) — a single row per persona. Called by the browser only
 * (`src/providers/mock/mock-provider.ts`), never by the Agent (architectural
 * invariant #4; the Agent never reads this directly — `pfm` folds it into the
 * hidden preamble of the customer's own messages, see
 * `src/lib/agent-preference-seed.ts`).
 */

function missingCif() {
  return NextResponse.json({ error: "cif is required" }, { status: 422 });
}

/** GET /api/agent-preferences?cif= — every field unset when the persona never saved one. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return missingCif();
  return NextResponse.json(readAgentPreferences(cif));
}

/**
 * PUT /api/agent-preferences — upsert the whole row (body `{cif, ...AgentPreferences}`).
 * 422 on an unknown enum value or free text over its cap (`AGENT_PREFERENCES_MAX`).
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const sanitized = sanitizeAgentPreferences(body);
  if ("error" in sanitized) return NextResponse.json({ error: sanitized.error }, { status: 422 });
  return NextResponse.json(writeAgentPreferences(cif, sanitized));
}
