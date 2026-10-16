/**
 * POST /api/assistant — server-side streaming endpoint for the AI facade.
 *
 * Node runtime (needs the SDK + server env). The API key stays here and never
 * reaches the client. Runs the full pipeline (`runAssistant`): intent → scope →
 * required-data → deterministic tools → validated narrative, streamed as NDJSON.
 * Degrades to the offline template when no provider/key is configured.
 */

import { buildAiContext } from "@/ai/server/load-financials";
import { getLlmClient } from "@/ai/llm";
import { runAssistant, type ChatMessage } from "@/ai/pipeline/orchestrator";
import type { AssistantEvent } from "@/ai/pipeline/events";
import { DEFAULT_PERSONA, type PersonaId } from "@/providers";
import type { ConsentScope } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  personaId?: PersonaId;
  month?: string;
  messages?: ChatMessage[];
  scopes?: ConsentScope[];
}

function ndjson(controller: ReadableStreamDefaultController, event: AssistantEvent): void {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
}

export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const personaId = body.personaId ?? DEFAULT_PERSONA;
  const messages = (body.messages ?? []).filter((m) => m?.content?.trim());
  if (messages.length === 0) {
    return Response.json({ error: "Cần ít nhất một tin nhắn." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ctx = await buildAiContext({ personaId, month: body.month, scopes: body.scopes });
        const client = getLlmClient();
        for await (const ev of runAssistant({ messages, ctx, client })) {
          ndjson(controller, ev);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Lỗi không xác định.";
        ndjson(controller, { type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
