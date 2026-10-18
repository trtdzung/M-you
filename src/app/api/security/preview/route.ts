import { NextRequest, NextResponse } from "next/server";
import { previewIncoming, previewTransfer } from "@/lib/security/preview";
import type { TransferReview } from "@/lib/security/signal-context";

/**
 * POST /api/security/preview — signals the engine would raise, without saving
 * anything. Body `{ cif, incoming?: true, review?: TransferReview }`.
 */

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

function parseReview(value: unknown): TransferReview | "invalid" | undefined {
  if (value === undefined) return undefined;
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!text(body?.cif, 64) || !body.cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const review = parseReview(body.review);
  if (review === "invalid") return NextResponse.json({ error: "review is invalid" }, { status: 422 });
  if (!review && body.incoming !== true) return NextResponse.json({ error: "review is required" }, { status: 422 });
  try {
    const signals = review ? previewTransfer(body.cif, review) : previewIncoming(body.cif);
    return NextResponse.json({ signals });
  } catch (err) {
    console.error("POST /api/security/preview failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
