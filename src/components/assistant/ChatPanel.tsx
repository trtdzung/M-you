"use client";

import { useEffect, useRef, useState } from "react";
import { usePersona } from "@/providers/context";
import { usePeriod } from "@/state/period";
import { getConsent } from "@/lib/consent";
import { streamAssistant, type ChatTurn } from "@/lib/assistant-stream";
import type { AssistantEvent } from "@/ai/pipeline/events";
import type { AssistantOpener } from "@/ai/proactive/openers";
import { ChatMessage } from "./ChatMessage";
import { Composer } from "./Composer";
import type { UiMessage } from "./types";

function blankAssistant(id: string): UiMessage {
  return { id, role: "assistant", text: "", chips: [], charts: [], degraded: false, refusal: false, status: "streaming" };
}

function seedOpener(opener: AssistantOpener): UiMessage {
  return {
    id: "opener",
    role: "assistant",
    text: opener.text,
    chips: opener.sources.length ? [{ name: "insight", sources: opener.sources }] : [],
    charts: [],
    degraded: false,
    refusal: false,
    status: "done",
  };
}

/** Apply one stream event to the in-progress assistant message (immutably). */
function reduce(msg: UiMessage, ev: AssistantEvent): UiMessage {
  switch (ev.type) {
    case "text":
      return { ...msg, text: msg.text + ev.delta };
    case "tool":
      return { ...msg, chips: [...msg.chips, { name: ev.name, sources: ev.sources, period: ev.period }] };
    case "chart":
      return { ...msg, charts: [...msg.charts, ev.chart] };
    case "degraded":
      return { ...msg, degraded: true };
    case "refusal":
      return { ...msg, refusal: true };
    case "clarify":
      return { ...msg, text: msg.text + ev.question };
    case "reconfirm":
      return {
        ...msg,
        text: msg.text + ev.summary,
        reconfirm: { reason: ev.reason, summary: ev.summary, riskFlags: ev.riskFlags },
      };
    case "draft":
      return { ...msg, draft: ev.draft, text: msg.text + (ev.note ? ev.note : "") };
    case "error":
      return { ...msg, error: ev.message, status: "done" };
    case "done":
      return { ...msg, degraded: msg.degraded || Boolean(ev.degraded), status: "done" };
    default:
      return msg;
  }
}

export function ChatPanel({ opener }: { opener?: AssistantOpener | null }) {
  const { personaId } = usePersona();
  const { month } = usePeriod();
  const [messages, setMessages] = useState<UiMessage[]>(opener ? [seedOpener(opener)] : []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const nextId = () => `m${++idRef.current}`;
  const hasUserMessage = messages.some((m) => m.role === "user");

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: UiMessage = { id: nextId(), role: "user", text, chips: [], charts: [], degraded: false, refusal: false, status: "done" };
    const assistantId = nextId();
    const turns: ChatTurn[] = [...messages.filter((m) => m.text), userMsg].map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [...prev, userMsg, blankAssistant(assistantId)]);
    setInput("");
    setStreaming(true);

    const scopes = getConsent()?.scopes ?? [];
    await streamAssistant({ personaId, month, messages: turns, scopes }, (ev) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? reduce(m, ev) : m)));
    });

    setMessages((prev) => prev.map((m) => (m.id === assistantId && m.status === "streaming" ? { ...m, status: "done" } : m)));
    setStreaming(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Hỏi mình bất kỳ điều gì về dòng tiền, chi tiêu, tài sản hay mục tiêu của bạn.
          </p>
        )}
        <div ref={endRef} />
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={send}
        disabled={streaming}
        showStarters={!hasUserMessage && !streaming}
      />
    </div>
  );
}
