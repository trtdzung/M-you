import { NextRequest, NextResponse } from "next/server";
import type { EvaluateTrigger } from "@/lib/security/intervention-types";
import { evaluate, type EvaluateInput } from "@/lib/security/orchestrator";

/**
 * POST /api/security/evaluate — run the Scam Shield engine for one trigger.
 * Body `{ cif, trigger, review?, txnId?, moment?, recipient? }` → `{ interventions }`
 * (spec wording at once; the fraud agent may enrich them later).
 */

const TRIGGERS = new Set<EvaluateTrigger>(["transfer_review", "recipient_entered", "incoming_credit", "app_open", "transfer_screen_open", "hub_open", "transfer_success"]);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const SCORE_LEVELS = new Set(["Rất cao", "Cao", "Tiêu chuẩn"]);

function parseReview(v: unknown): EvaluateInput["review"] | "invalid" | undefined {
  if (v === undefined) return undefined;
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return "invalid";
  if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0) return "invalid";
  if (!text(r.recipientName, 120) || !text(r.recipientAccount, 40) || !/\d{4}/.test(r.recipientAccount)) return "invalid";
  if (r.recipientBank !== undefined && r.recipientBank !== null && !text(r.recipientBank, 80)) return "invalid";
  if (r.memo !== undefined && r.memo !== null && !text(r.memo, 200)) return "invalid";
  if (r.sourceAccountId !== undefined && r.sourceAccountId !== null && !text(r.sourceAccountId, 64)) return "invalid";
  return {
    amount: r.amount, recipientName: r.recipientName, recipientAccount: r.recipientAccount,
    recipientBank: (r.recipientBank as string | null | undefined) ?? undefined, memo: (r.memo as string | null | undefined) ?? null,
    sourceAccountId: (r.sourceAccountId as string | null | undefined) ?? null,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!text(body?.cif, 64) || !body.cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!TRIGGERS.has(body?.trigger)) return NextResponse.json({ error: "trigger is invalid" }, { status: 422 });
  const review = parseReview(body.review);
  if (review === "invalid") return NextResponse.json({ error: "review is invalid" }, { status: 422 });
  if ((body.trigger === "transfer_review" || body.trigger === "recipient_entered") && !review) {
    return NextResponse.json({ error: "review is required" }, { status: 422 });
  }
  const input: EvaluateInput = { review };
  if (body.txnId !== undefined) {
    if (!text(body.txnId, 80)) return NextResponse.json({ error: "txnId is invalid" }, { status: 422 });
    input.txnId = body.txnId;
  }
  if (body.moment !== undefined) {
    const m = body.moment ?? {};
    const age = m.accountAgeDays;
    const score = m.score;
    if (age !== undefined && age !== null && !(typeof age === "number" && age >= 0)) return NextResponse.json({ error: "moment is invalid" }, { status: 422 });
    if (score !== undefined && score !== null && !(typeof score?.total === "number" && SCORE_LEVELS.has(score?.level))) {
      return NextResponse.json({ error: "moment is invalid" }, { status: 422 });
    }
    const steps = score?.steps;
    if (steps !== undefined && !(Array.isArray(steps) && steps.length <= 6 && steps.every((s: { label?: unknown; points?: unknown; cta?: unknown }) =>
      text(s?.label, 40) && typeof s?.points === "number" && text(s?.cta, 30)))) {
      return NextResponse.json({ error: "moment is invalid" }, { status: 422 });
    }
    input.moment = { accountAgeDays: age ?? null, score: score ? { total: score.total, level: score.level, steps } : null };
  }
  if (body.recipient !== undefined) {
    if (!text(body.recipient?.last4, 4) || !/^\d{4}$/.test(body.recipient.last4) || !text(body.recipient?.bank ?? "", 80)) {
      return NextResponse.json({ error: "recipient is invalid" }, { status: 422 });
    }
    input.recipient = { last4: body.recipient.last4, bank: body.recipient.bank ?? "" };
  }
  try {
    return NextResponse.json({ interventions: evaluate(body.cif, body.trigger, input) });
  } catch (err) {
    console.error("POST /api/security/evaluate failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
