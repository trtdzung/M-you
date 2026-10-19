import { NextRequest, NextResponse } from "next/server";
import { addWarned, listWarned, removeWarned, type WarnLevel } from "@/lib/security/warned-store";

/**
 * The mock fraud-warning list (SIMO stand-in). Test tools list, add, and
 * remove rows. Every row is source "mock".
 */

const LEVELS = new Set<WarnLevel>(["danger", "suspicious"]);
const accountOk = (value: string) => /^[\d\s.-]{6,34}$/.test(value) && value.replace(/\D/g, "").length >= 6;

/** GET /api/security/warned → `{ accounts, disclaimer }`. */
export async function GET() {
  try {
    return NextResponse.json({ accounts: listWarned(), disclaimer: "Dữ liệu giả lập (mock)" });
  } catch (err) {
    console.error("GET /api/security/warned failed", err);
    return NextResponse.json({ error: "warned list unavailable" }, { status: 500 });
  }
}

/** POST /api/security/warned — body `{ account, bank?, level, note? }`. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const account = typeof body?.account === "string" ? body.account.trim() : "";
  const bank = typeof body?.bank === "string" ? body.bank.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!accountOk(account)) return NextResponse.json({ error: "account is invalid" }, { status: 422 });
  if (bank.length > 80) return NextResponse.json({ error: "bank is invalid" }, { status: 422 });
  if (!LEVELS.has(body?.level)) return NextResponse.json({ error: "level is invalid" }, { status: 422 });
  if (note.length > 200) return NextResponse.json({ error: "note is invalid" }, { status: 422 });
  try {
    addWarned({ account, bank, level: body.level, note });
    return NextResponse.json({ accounts: listWarned(), disclaimer: "Dữ liệu giả lập (mock)" });
  } catch (err) {
    console.error("POST /api/security/warned failed", err);
    return NextResponse.json({ error: "warned list unavailable" }, { status: 500 });
  }
}

/** DELETE /api/security/warned?account=&bank= — omit bank to drop every bank of that number. */
export async function DELETE(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const account = params.get("account")?.trim() ?? "";
  const bank = params.get("bank");
  if (!accountOk(account)) return NextResponse.json({ error: "account is invalid" }, { status: 422 });
  if (bank !== null && bank.length > 80) return NextResponse.json({ error: "bank is invalid" }, { status: 422 });
  try {
    removeWarned(account, bank === null ? undefined : bank);
    return NextResponse.json({ accounts: listWarned(), disclaimer: "Dữ liệu giả lập (mock)" });
  } catch (err) {
    console.error("DELETE /api/security/warned failed", err);
    return NextResponse.json({ error: "warned list unavailable" }, { status: 500 });
  }
}
