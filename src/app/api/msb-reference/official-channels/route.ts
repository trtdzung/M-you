import { NextRequest, NextResponse } from "next/server";
import { CHANNEL_TYPES, checkOfficialChannel, listChannels, REFERENCE_AS_OF, type ChannelType } from "@/lib/msb-reference";

/**
 * GET /api/msb-reference/official-channels[?type=domain|hotline|sms_sender|app]  → the list
 * GET /api/msb-reference/official-channels?value=<link|number|sender>             → { official, channel }
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const value = params.get("value");
  if (value) return NextResponse.json({ source: "mock", asOf: REFERENCE_AS_OF, query: value, ...checkOfficialChannel(value) });
  const type = params.get("type");
  if (type && !CHANNEL_TYPES.includes(type as ChannelType)) {
    return NextResponse.json({ error: `type must be one of ${CHANNEL_TYPES.join(", ")}` }, { status: 422 });
  }
  return NextResponse.json({ source: "mock", asOf: REFERENCE_AS_OF, items: listChannels((type as ChannelType) ?? undefined) });
}
