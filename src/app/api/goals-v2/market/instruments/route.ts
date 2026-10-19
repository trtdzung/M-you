import { NextResponse } from "next/server";
import { registerStockSymbol } from "@/features/goals-preview/server/prices/sync";

/**
 * POST /api/goals-v2/market/instruments { symbol } → { instrument }.
 * Kiểm mã cổ phiếu qua VNDirect, có dữ liệu thì đăng ký công cụ + lịch sử giá; không có → 422.
 */
export async function POST(request: Request) {
  let symbol = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && typeof (body as { symbol?: unknown }).symbol === "string") {
      symbol = (body as { symbol: string }).symbol.trim().toUpperCase();
    }
  } catch {
    // body hỏng → coi như thiếu mã
  }
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Không tìm thấy mã cổ phiếu này trên sàn." }, { status: 422 });
  }
  try {
    const result = await registerStockSymbol(symbol);
    if (result.ok) return NextResponse.json({ instrument: result.instrument });
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Không tìm thấy mã cổ phiếu này trên sàn." }, { status: 422 });
    }
    return NextResponse.json({ error: "Chưa kiểm tra được mã cổ phiếu lúc này. Bạn thử lại sau nhé." }, { status: 502 });
  } catch (err) {
    console.error("POST /api/goals-v2/market/instruments failed", err);
    return NextResponse.json({ error: "Chưa kiểm tra được mã cổ phiếu lúc này. Bạn thử lại sau nhé." }, { status: 500 });
  }
}
