import { NextRequest, NextResponse } from "next/server";
import { inspectEngine } from "@/lib/security/inspect";
import type { TransferReview } from "@/lib/security/signal-context";

/**
 * GET/POST /api/security/inspect — Engine inspector + simulated family inbox.
 * Read only. Body or query `{ cif, review? }`.
 */

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

function parseReview(value: unknown): TransferReview | "invalid" | undefined {
  if (value === undefined || value === null) return undefined;
  const review = value as Record<string, unknown> | null;
  if (!review || typeof review !== "object") return "invalid";
  if (typeof review.amount !== "number" || !Number.isFinite(review.amount) || review.amount <= 0) return "invalid";
  if (!text(review.recipientName, 120) || !text(review.recipientAccount, 40) || !/\d{4}/.test(review.recipientAccount)) return "invalid";
  if (review.recipientBank !== undefined && review.recipientBank !== null && !text(review.recipientBank, 80)) return "invalid";
  if (review.memo !== undefined && review.memo !== null && !text(review.memo, 200)) return "invalid";
  if (review.sourceAccountId !== undefined && review.sourceAccountId !== null && !text(review.sourceAccountId, 64)) return "invalid";
  return {
    amount: review.amount,
    recipientName: review.recipientName,
    recipientAccount: review.recipientAccount,
    recipientBank: (review.recipientBank as string | null | undefined) ?? undefined,
    memo: (review.memo as string | null | undefined) ?? null,
    sourceAccountId: (review.sourceAccountId as string | null | undefined) ?? null,
  };
}

function snapshot(cif: string, review: TransferReview | undefined) {
  return NextResponse.json(inspectEngine(cif, review));
}

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!text(cif, 64) || !cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return snapshot(cif, undefined);
  } catch (err) {
    console.error("GET /api/security/inspect failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!text(body?.cif, 64) || !body.cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const review = parseReview(body.review);
  if (review === "invalid") return NextResponse.json({ error: "review is invalid" }, { status: 422 });
  try {
    return snapshot(body.cif, review);
  } catch (err) {
    console.error("POST /api/security/inspect failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
