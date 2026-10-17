import { NextRequest, NextResponse } from "next/server";
import { deleteGoal } from "../server/goals-repo";
import { cifOf, missingCif, notFound, type RouteCtx } from "./_http";

/** DELETE /api/goals/:id?cif= */
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const cif = cifOf(req.nextUrl.searchParams.get("cif"));
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  if (!deleteGoal(cif, id)) return notFound();
  return new NextResponse(null, { status: 204 });
}
