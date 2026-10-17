import { NextRequest, NextResponse } from "next/server";
import { generateHomeInsight, homeInsightEvent } from "@/lib/home-insight-service";
import { PERSONA_LIST } from "@/providers/mock/personas";

export const dynamic = "force-dynamic";

/** The demo identity boundary follows existing PFM APIs. Production needs a session-bound CIF. */
export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length > 128_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(text);
    if (!body || !PERSONA_LIST.some((p) => p.cif === body.cif)) return NextResponse.json({ error: "Unknown customer" }, { status: 422 });
    if (body.event !== undefined) {
      if (!["displayed", "dismissed"].includes(body.event) || !/^[a-f0-9]{64}$/.test(body.snapshotId ?? "")) {
        return NextResponse.json({ error: "Invalid interaction" }, { status: 422 });
      }
      return NextResponse.json({ recorded: homeInsightEvent(body.cif, body.snapshotId, body.event) });
    }
    return NextResponse.json(await generateHomeInsight(body.cif, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : error instanceof RangeError ? 422 : 503;
    return NextResponse.json({ error: "Không thể cập nhật insight" }, { status });
  }
}
