import { NextResponse } from "next/server";
import { readMarketInstruments } from "@/features/goals-preview/server/prices/repo";
import { refreshPricesNow } from "@/features/goals-preview/server/prices/sync";

/** POST /api/goals-v2/market/refresh → { instruments, asOf, refreshing }. Starts a background sync, never waits for it. */
export async function POST() {
  try {
    const status = refreshPricesNow();
    return NextResponse.json({ instruments: readMarketInstruments(), ...status });
  } catch (err) {
    console.error("POST /api/goals-v2/market/refresh failed", err);
    return NextResponse.json({ error: "market unavailable" }, { status: 500 });
  }
}
