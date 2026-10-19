import { NextRequest, NextResponse } from "next/server";
import { diagnose, readDiagnosis } from "@/lib/security/diagnosis";
import { DIAGNOSE_ANSWERS } from "@/lib/security/scenario-copy";
const validCif = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const ANSWERS = new Set<string>(DIAGNOSE_ANSWERS);
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "invalid cif" }, { status: 422 });
  const state = readDiagnosis(cif, id);
  return state ? NextResponse.json(state) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!validCif(body?.cif) || typeof body?.answer !== "string" || !ANSWERS.has(body.answer.trim())) return NextResponse.json({ error: "invalid request" }, { status: 422 });
  if (!readDiagnosis(body.cif, id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const state = await diagnose(body.cif, id, body.answer.trim());
  return state ? NextResponse.json(state) : NextResponse.json({ error: "already answered or pending" }, { status: 409 });
}
