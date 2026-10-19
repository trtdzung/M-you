import { NextRequest, NextResponse } from "next/server";
import { recordEvent } from "@/features/goals-preview/server/suggestions/service";
import { SUGGESTION_EVENTS, type SuggestionEvent } from "@/features/goals-preview/server/suggestions/store";

/** POST /api/goals-v2/suggestions/events — body { cif, suggestionId, event }; "dismissed" = "Để sau". */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  const suggestionId = body?.suggestionId;
  const event = body?.event;
  if (typeof cif !== "string" || cif === "") return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof suggestionId !== "string" || suggestionId === "") {
    return NextResponse.json({ error: "suggestionId is required" }, { status: 422 });
  }
  if (!SUGGESTION_EVENTS.includes(event as SuggestionEvent)) {
    return NextResponse.json({ error: `event must be one of ${SUGGESTION_EVENTS.join(", ")}` }, { status: 422 });
  }
  try {
    if (!recordEvent(cif, suggestionId, event as SuggestionEvent)) {
      return NextResponse.json({ error: "suggestion not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/goals-v2/suggestions/events failed", err);
    return NextResponse.json({ error: "event not recorded" }, { status: 500 });
  }
}
