"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { usePersona } from "@/providers/context";
import { usePeriod } from "@/state/period";
import { getConsent } from "@/lib/consent";
import { streamAssistant, type ChatTurn } from "@/lib/assistant-stream";
import { ErrorState } from "@/components/states";
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

/** Derive a quick-suggestion chip from the opener (its headline before the first period). */
function openerStarter(opener?: AssistantOpener | null): string | null {
  if (!opener) return null;
  const head = opener.text.split(". ")[0]?.trim();
  return head && head.length <= 48 ? head : null;
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

export function ChatPanel({
  opener,
  loading = false,
  error = false,
}: {
  opener?: AssistantOpener | null;
  loading?: boolean;
  error?: boolean;
}) {
  const { personaId } = usePersona();
  const { month } = usePeriod();
  const [messages, setMessages] = useState<UiMessage[]>(opener ? [seedOpener(opener)] : []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // AI consent scope: null while checking (avoids a hydration flash), then boolean.
  const [aiScope, setAiScope] = useState<boolean | null>(null);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  // Seed the opener at most once — it may arrive after mount (insights load async).
  const seededRef = useRef<boolean>(Boolean(opener));

  const nextId = () => `m${++idRef.current}`;
  const hasUserMessage = messages.some((m) => m.role === "user");
  const noScope = aiScope === false;

  useEffect(() => {
    setAiScope((getConsent()?.scopes ?? []).includes("ai"));
  }, []);

  useEffect(() => {
    if (seededRef.current || !opener) return;
    seededRef.current = true;
    setMessages((prev) => (prev.length === 0 ? [seedOpener(opener)] : prev));
  }, [opener]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || noScope) return;

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
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <ErrorState />
        ) : loading ? (
          <MessageShimmer />
        ) : noScope ? (
          <NoScopeState />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.length === 0 && <EmptyGreeting />}
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={send}
        disabled={streaming || noScope}
        showStarters={!hasUserMessage && !streaming && !loading && !error && !noScope}
        openerStarter={openerStarter(opener)}
        hint={noScope ? "Cần cấp quyền cho trợ lý AI để bắt đầu trò chuyện." : undefined}
      />
    </div>
  );
}

/** Warm greeting shown when there are no messages and no opener. */
function EmptyGreeting() {
  return (
    <div className="px-1 py-4">
      <p className="text-base font-semibold text-text">Xin chào 👋</p>
      <p className="mt-1 text-sm text-muted">
        Hỏi mình bất kỳ điều gì về dòng tiền, chi tiêu, tài sản hay mục tiêu của bạn — hoặc chọn một gợi ý bên dưới.
      </p>
    </div>
  );
}

/** Peach shimmer placeholder while insights/financials load — never collapses the layout. */
function MessageShimmer() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Đang tải trợ lý">
      <div className="shimmer h-16 w-4/5 rounded-2xl rounded-bl-sm" />
      <div className="shimmer ml-auto h-10 w-3/5 rounded-2xl rounded-br-sm" />
      <div className="shimmer h-20 w-4/5 rounded-2xl rounded-bl-sm" />
    </div>
  );
}

/** No AI consent scope granted — explain what's missing instead of a broken chat. */
function NoScopeState() {
  return (
    <div className="shadow-card flex flex-col items-center justify-center gap-3 rounded-[24px] bg-warning-soft/60 px-6 py-10 text-center">
      <ShieldAlert size={38} strokeWidth={1.5} className="text-warning" />
      <div>
        <p className="text-base font-semibold text-text">Chưa cấp quyền cho trợ lý</p>
        <p className="mt-1 text-sm text-muted">
          Trợ lý cần quyền đọc dữ liệu (AI) để giải thích số liệu của bạn. Bạn có thể cấp quyền trong phần Cài đặt · Quyền riêng tư.
        </p>
      </div>
    </div>
  );
}
