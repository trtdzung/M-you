import { NextRequest, NextResponse } from "next/server";
import { interviewCase } from "@/lib/security/case-interview";

const validCif = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** POST /api/security/cases/interview — next SC2 question. Image bytes are rejected. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "body is invalid" }, { status: 422 });
  if (["attachment", "attachments", "image", "base64"].some(key => key in body)) {
    return NextResponse.json({ error: "images are not accepted" }, { status: 422 });
  }
  if (!validCif(body.cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof body.id !== "string" || !body.id || body.id.length > 80) return NextResponse.json({ error: "id is required" }, { status: 422 });
  if (body.answer !== undefined && body.answer !== null && (typeof body.answer !== "string" || body.answer.length > 1000 || !body.answer.trim())) {
    return NextResponse.json({ error: "answer is invalid" }, { status: 422 });
  }
  try {
    const turn = await interviewCase(body.cif, body.id, body.answer ?? null);
    return turn ? NextResponse.json(turn) : NextResponse.json({ error: "case not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "case unavailable" }, { status: 500 });
  }
}
