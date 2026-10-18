import { NextRequest, NextResponse } from "next/server";
import { isSecurityEventType, SECURITY_EVENT_TYPES, type SecurityEventType } from "@/lib/security/event-types";
import { eventsSince, recordEvent } from "@/lib/security/events";
import { evaluate } from "@/lib/security/orchestrator";

/**
 * Scam Shield event log for one persona. The browser posts what happened
 * (screens opened, test-tools simulations); server code records its own events
 * directly with `recordEvent`.
 */

const MAX_PAYLOAD_CHARS = 4_000;
const validCif = (cif: unknown): cif is string => typeof cif === "string" && cif.length > 0 && cif.length <= 64;

// Flat facts only: strings, numbers, booleans, null, or lists of short strings.
function isFlatPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(v =>
    v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 500)
    || (Array.isArray(v) && v.length <= 20 && v.every(item => typeof item === "string" && item.length <= 100)));
}

/** POST /api/security/events — body `{ cif, type, payload }` → the stored event. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!validCif(body?.cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!isSecurityEventType(body?.type)) return NextResponse.json({ error: "type is invalid" }, { status: 422 });
  const payload = body.payload ?? {};
  if (!isFlatPayload(payload) || JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json({ error: "payload is invalid" }, { status: 422 });
  }
  try {
    // The payload shape per type is a contract of the callers; the route only bounds it.
    const event = recordEvent(body.cif, body.type, payload as never);
    // Opening Home or the transfer screen is an engine moment (BT1). The Hub sends its score itself.
    if (body.type === "app_open" || body.type === "transfer_screen_open" || body.type === "device_login") {
      try {
        evaluate(body.cif, body.type);
      } catch (err) {
        console.error("Scam Shield evaluate after event failed", err);
      }
    }
    return NextResponse.json(event);
  } catch (err) {
    console.error("POST /api/security/events failed", err);
    return NextResponse.json({ error: "events unavailable" }, { status: 500 });
  }
}

/** GET /api/security/events?cif=&since=&types=a,b — events oldest first (`since` in ms, default 0). */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cif = params.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const since = Number(params.get("since") ?? 0);
  if (!Number.isFinite(since)) return NextResponse.json({ error: "since is invalid" }, { status: 422 });
  const types = params.get("types")?.split(",").filter(Boolean);
  if (types && !types.every(isSecurityEventType)) {
    return NextResponse.json({ error: `types must be among ${SECURITY_EVENT_TYPES.join(", ")}` }, { status: 422 });
  }
  try {
    return NextResponse.json(eventsSince(cif, since, types as SecurityEventType[] | undefined));
  } catch (err) {
    console.error("GET /api/security/events failed", err);
    return NextResponse.json({ error: "events unavailable" }, { status: 500 });
  }
}
