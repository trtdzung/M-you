import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { reminderFor } from "../server/reminder-service";
import { dismissReminder } from "../server/reminders-repo";
import { badBody, cifOf, missingCif, readJson, type RouteCtx } from "./_http";

/** POST /api/goals/:id/reminder — body { cif, dismiss?: reminderId } -> { reminder | null } (one per goal per week). */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  const now = transferNow();
  if (typeof body.dismiss === "string") {
    dismissReminder(cif, body.dismiss, now);
    return NextResponse.json({ reminder: null });
  }
  return NextResponse.json({ reminder: reminderFor(cif, id, now) });
}
