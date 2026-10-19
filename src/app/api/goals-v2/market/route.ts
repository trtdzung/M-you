import { NextResponse } from "next/server";
import { readMarketInstruments, readPriceStatus } from "@/features/goals-preview/server/prices/repo";
import { ensurePricesFresh } from "@/features/goals-preview/server/prices/sync";

/** GET /api/goals-v2/market → { instruments, asOf, refreshing } (client hỏi lại khi `refreshing`). */
export async function GET() {
  try {
    ensurePricesFresh();
    return NextResponse.json({ instruments: readMarketInstruments(), ...readPriceStatus() });
  } catch (err) {
    console.error("GET /api/goals-v2/market failed", err);
    return NextResponse.json({ error: "market unavailable" }, { status: 500 });
  }
}
