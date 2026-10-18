import { NextRequest, NextResponse } from "next/server";
import { educateHandbook, isHandbookContext } from "@/lib/security/educate";

/** POST /api/security/educate { cif, trigger } — rule article at once; the agent may rewrite the three lines. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) {
    return NextResponse.json({ error: "cif is required" }, { status: 422 });
  }
  if (!isHandbookContext(body.trigger)) return NextResponse.json({ error: "trigger is invalid" }, { status: 422 });
  try {
    const article = await educateHandbook(body.cif, body.trigger);
    return NextResponse.json({ articleId: article.id, title: article.title, summary: article.summary, source: article.source });
  } catch (err) {
    console.error("POST /api/security/educate failed", err);
    return NextResponse.json({ error: "educate unavailable" }, { status: 500 });
  }
}
