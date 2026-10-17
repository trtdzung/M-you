import { NextRequest, NextResponse } from "next/server";
import { CATEGORIZE_CHUNK_SIZE } from "@/ai/categorize/config";
import { getLlmClient } from "@/ai/llm";
import {
  buildCategorizeSystemPrompt,
  buildUserPrompt,
  parseCategorizeResults,
} from "@/ai/categorize/prompt";
import type { ClassifyInput } from "@/ai/categorize/types";
import { readCategories } from "@/lib/categories-store";

/**
 * Same-origin proxy for the AI categorizer. The browser calls THIS route (never
 * the model endpoint directly), so the GreenNode API key stays server-side
 * (`getLlmClient()` is `server-only`).
 *
 * Guards (Red Team #2), independent of the model:
 *  - `user_id` REQUIRED (400) — minimal authz/correlation.
 *  - `items` MUST be an array, capped server-side — bounds cost / oracle abuse.
 *  - each item is coerced to a minimal `ClassifyInput` — the client body is
 *    untrusted; only whitelisted fields reach the prompt.
 *
 * No key configured ⇒ 501 (offline). The client then degrades to the local
 * heuristic. Whatever the model returns is STILL re-validated (syntactic +
 * semantic) and confidence-gated in `categorize-service` — the model is
 * untrusted; it can never label outside the taxonomy or move a number (#1/#7).
 *
 * NOTE (prototype limit): client-side consent is NOT a real server boundary.
 * `user_id` + the items cap are the only server checks; full protection needs
 * session infra. See project-backlog.md.
 */

const ITEMS_CAP = CATEGORIZE_CHUNK_SIZE;

/** Coerce one untrusted client item into a safe ClassifyInput (data only). */
function toInput(raw: unknown): ClassifyInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.txnId !== "string") return null;
  const merchant = typeof r.merchant === "string" ? r.merchant : "";
  const direction = r.direction === "credit" ? "credit" : "debit";
  return {
    txnId: r.txnId,
    merchant: merchant.slice(0, 200),
    amount: typeof r.amount === "number" ? r.amount : 0,
    direction,
    type: typeof r.type === "string" ? r.type : "expense",
    ...(typeof r.note === "string" ? { note: r.note.slice(0, 200) } : {}),
  };
}

export async function POST(req: NextRequest) {
  let body: { user_id?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { user_id, items } = body;
  if (!user_id || typeof user_id !== "string") {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }
  // Maps merchants into THIS persona's stored expense categories. The catalogue
  // is read here, server-side, from the cif we already have — the browser never
  // tells the prompt which categories exist, so it cannot widen the model's
  // option set (invariant #2/#4).
  const systemPrompt = buildCategorizeSystemPrompt(
    readCategories(user_id).filter((c) => c.kind === "expense"),
  );
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }
  if (items.length > ITEMS_CAP) {
    return NextResponse.json({ error: `too many items (max ${ITEMS_CAP})` }, { status: 400 });
  }

  const inputs = items.map(toInput).filter((i): i is ClassifyInput => i !== null);
  if (inputs.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const client = getLlmClient();
  if (!client) {
    // No model configured — tell the client to fall back to the local heuristic.
    return NextResponse.json({ error: "categorizer offline (no LLM configured)" }, { status: 501 });
  }

  // Size the token budget to the batch so a full 50-item chunk's JSON is not
  // truncated mid-array (a truncated 200-OK body parses to [] — a silent no-op,
  // NOT a chunk error — so it would neither label nor trigger the fallback).
  const maxTokens = Math.min(4096, Math.max(1024, inputs.length * 48 + 256));

  try {
    const completion = await client.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(inputs) },
      ],
      { json: true, temperature: 0, maxTokens },
    );
    const results = parseCategorizeResults(completion);
    return NextResponse.json({ results });
  } catch (err) {
    // Log server-side only (never leak upstream detail/keys to the client).
    console.error("[categorize] upstream error:", err);
    return NextResponse.json({ error: "categorizer upstream error" }, { status: 502 });
  }
}
