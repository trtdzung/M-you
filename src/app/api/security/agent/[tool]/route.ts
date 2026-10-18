import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { agentIntervention, agentRecipient, agentLookup, agentEvents, agentProfile, agentAlerts, agentCase } from "@/lib/security/agent-read";

const valid = (v: string | null, max = 80): v is string => !!v && v.length <= max;
/** Read-only, private tool gateway; never returns full names/account numbers or images. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ tool: string }> }) {
  const expected = process.env.AGENT_API_KEY ?? "";
  const given = req.headers.get("x-agent-key") ?? "";
  const a = Buffer.from(expected), b = Buffer.from(given);
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tool } = await ctx.params;
  const p = req.nextUrl.searchParams;
  const cif = p.get("cif"), id = p.get("id"), account = p.get("account"), bank = p.get("bank") ?? "";
  if (["recipient", "events", "profile", "alerts"].includes(tool) && !valid(cif, 64)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (["intervention", "case"].includes(tool) && !valid(id)) return NextResponse.json({ error: "id is required" }, { status: 422 });
  if (["recipient", "lookup"].includes(tool) && (!valid(account, 40) || !/\d{4}/.test(account) || bank.length > 80)) return NextResponse.json({ error: "account is invalid" }, { status: 422 });
  const hours = Number(p.get("hours") ?? 24), days = Number(p.get("days") ?? 30);
  if ((tool === "events" && !(hours > 0 && hours <= 744)) || (tool === "alerts" && !(days > 0 && days <= 365))) return NextResponse.json({ error: "window is invalid" }, { status: 422 });
  try {
    const data = tool === "intervention" ? agentIntervention(id!) : tool === "recipient" ? agentRecipient(cif!, account!, bank)
      : tool === "lookup" ? agentLookup(account!, bank) : tool === "events" ? agentEvents(cif!, hours)
      : tool === "profile" ? agentProfile(cif!) : tool === "alerts" ? agentAlerts(cif!, days) : tool === "case" ? agentCase(id!) : undefined;
    if (data === undefined) return NextResponse.json({ error: "unknown tool" }, { status: 404 });
    return data === null ? NextResponse.json({ error: "not found" }, { status: 404 }) : NextResponse.json(data);
  } catch { return NextResponse.json({ error: "data unavailable" }, { status: 500 }); }
}
