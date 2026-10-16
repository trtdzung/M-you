/**
 * Anthropic adapter — the default `LlmClient` implementation. Reads its key and
 * model from server-side env only. Maps the neutral message/tool shapes to the
 * Anthropic Messages API and normalizes its streaming events back to
 * `LlmStreamEvent`. Adding another provider means writing a sibling of this file.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmClient,
  LlmContentBlock,
  LlmMessage,
  LlmStreamEvent,
  LlmStreamParams,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 1024;

function toAnthropicContent(block: LlmContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError,
      };
  }
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content.map(toAnthropicContent) }));
}

function mapStopReason(reason: string | null | undefined): LlmStreamEvent & { type: "done" } {
  const map: Record<string, "end" | "tool_use" | "max_tokens" | "other"> = {
    end_turn: "end",
    stop_sequence: "end",
    tool_use: "tool_use",
    max_tokens: "max_tokens",
  };
  return { type: "done", stopReason: (reason && map[reason]) || "other" };
}

export function createAnthropicClient(): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY chưa được cấu hình (server-side).");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  return {
    provider: "anthropic",
    model,
    async *streamMessage(params: LlmStreamParams): AsyncIterable<LlmStreamEvent> {
      // Per-content-block accumulation of streamed tool-call JSON.
      const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
      let stopReason: string | null = null;

      const stream = await client.messages.create({
        model,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: params.temperature ?? 0.2,
        system: params.system,
        messages: toAnthropicMessages(params.messages),
        tools: params.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          toolBlocks.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            json: "",
          });
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text", delta: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            const blk = toolBlocks.get(event.index);
            if (blk) blk.json += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          const blk = toolBlocks.get(event.index);
          if (blk) {
            let input: unknown = {};
            try {
              input = blk.json ? JSON.parse(blk.json) : {};
            } catch {
              input = {};
            }
            yield { type: "tool_use", id: blk.id, name: blk.name, input };
            toolBlocks.delete(event.index);
          }
        } else if (event.type === "message_delta") {
          stopReason = event.delta.stop_reason ?? stopReason;
        }
      }

      yield mapStopReason(stopReason);
    },
  };
}
