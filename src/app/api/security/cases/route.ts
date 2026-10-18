import { NextRequest, NextResponse } from "next/server";
import { engineNow } from "@/lib/security/clock";
import { openCase, readCases, saveCase } from "@/lib/security/case-store";
import { CASE_FIELDS, MAX_CASE_IMAGE_BYTES, type CaseAttachment } from "@/lib/security/case-types";

const validCif = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try { return NextResponse.json({ cases: readCases(cif), now: engineNow(cif).getTime() }); }
  catch { return NextResponse.json({ error: "cases unavailable" }, { status: 500 }); }
}
function image(v: unknown): CaseAttachment | null {
  const a = v as CaseAttachment | null;
  if (!a || typeof a.name !== "string" || !a.name.trim() || a.name.length > 120 || typeof a.base64 !== "string") return null;
  if (a.base64.length > Math.ceil(MAX_CASE_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64)) return null;
  const bytes = Buffer.from(a.base64, "base64");
  if (!bytes.length || bytes.length > MAX_CASE_IMAGE_BYTES) return null;
  const valid = a.mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : a.mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : a.mime === "image/webp" && bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP";
  return valid ? { name: a.name, mime: a.mime, base64: a.base64 } : null;
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!validCif(body?.cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!["open", "save", "submit", "update"].includes(body.action)) return NextResponse.json({ error: "action is invalid" }, { status: 422 });
  if (body.action !== "open" && (typeof body.id !== "string" || body.id.length > 80)) return NextResponse.json({ error: "id is required" }, { status: 422 });
  if (body.answers !== undefined && !(Array.isArray(body.answers) && body.answers.length === CASE_FIELDS.length && body.answers.every((a: unknown) => typeof a === "string" && a.length <= 500))) {
    return NextResponse.json({ error: "answers are invalid" }, { status: 422 });
  }
  if (body.answers?.[1] && !(Number.isFinite(Number(body.answers[1])) && Number(body.answers[1]) > 0)) return NextResponse.json({ error: "amount is invalid" }, { status: 422 });
  const attachment = body.attachment === undefined ? undefined : image(body.attachment);
  if (attachment === null) return NextResponse.json({ error: "image must be PNG/JPEG/WebP, at most 2 MB" }, { status: 422 });
  try {
    const item = body.action === "open" ? openCase(body.cif) : saveCase(body.cif, body.id, { answers: body.answers, attachment,
      submit: body.action === "submit", update: body.action === "update" });
    return item ? NextResponse.json({ case: item }) : NextResponse.json({ error: "case not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && ["incomplete case", "attachment limit"].includes(error.message)) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ error: "case unavailable" }, { status: 500 });
  }
}
