import { NextResponse } from "next/server";
import { readStockDirectory } from "@/features/goals-preview/server/prices/directory";

export async function GET() {
  try {
    return NextResponse.json({ items: readStockDirectory() });
  } catch (error) {
    console.error("GET /api/goals-v2/market/stock-directory failed", error);
    return NextResponse.json({ error: "market unavailable" }, { status: 500 });
  }
}
