import { NextRequest, NextResponse } from "next/server";
import { rewindToNow } from "@/features/goals-preview/server/rewind";

/**
 * POST /api/goals-v2/rewind — body { cif }. Công cụ test: đồng hồ về giờ thật và xoá dữ liệu mô phỏng ở tương lai.
 * 200 { ok: true, ...RewindResult } · 422 thiếu cif · 500 lỗi (không ghi gì: một transaction).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (typeof cif !== "string" || cif === "" || cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json({ ok: true, ...rewindToNow(cif) });
  } catch (err) {
    console.error("POST /api/goals-v2/rewind failed", err);
    return NextResponse.json({ error: "rewind failed" }, { status: 500 });
  }
}
