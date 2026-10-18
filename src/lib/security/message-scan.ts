import "server-only";

import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { normalizeText, scanMessage, type ScanLevel, type ScanResult } from "@/components/settings/security/scan-message";
import { clipOutput, recordAiJournal, toolNames } from "./ai-journal";
import { fraudAgentEnabled } from "./fraud-switch";
import { redactSecurityText } from "./redact";

const RANK: Record<ScanLevel, number> = { clear: 0, suspicious: 1, danger: 2 };
const TO_AGENT = { clear: "none", suspicious: "suspicious", danger: "danger" } as const;
const FROM_AGENT: Record<string, ScanLevel> = { none: "clear", suspicious: "suspicious", danger: "danger" };

export type MessageScan = ScanResult & { manipulationSigns: string[]; source: "rule" | "agent" };

/** Rule result shown before the model returns. Agent copy may only keep or raise this level. */
export function ruleScan(text: string): MessageScan {
  return { ...scanMessage(text), manipulationSigns: [], source: "rule" };
}

function strings(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 400);
}

function traceOk(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 30 && value.every(item => {
    if (!item || typeof item !== "object") return false;
    const row = item as { tool?: unknown; elapsed_ms?: unknown; result?: unknown };
    return typeof row.tool === "string" && row.tool.length > 0 && row.tool.length <= 80
      && Number.isInteger(row.elapsed_ms) && (row.elapsed_ms as number) >= 0
      && (row.result === "ok" || row.result === "no_data" || row.result === "error");
  });
}

function unsafe(text: string): boolean {
  const plain = normalizeText(text);
  return plain.includes("an toan") || plain.includes("khong phai lua dao");
}

function asAgent(value: unknown, floor: ScanLevel): MessageScan | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Object.keys(row).every(key => ["level", "reasons", "manipulation_signs", "trace"].includes(key))) return null;
  if (typeof row.level !== "string" || !(row.level in FROM_AGENT)) return null;
  const level = FROM_AGENT[row.level];
  if (RANK[level] < RANK[floor]) return null;
  if (!strings(row.reasons, 1, 10) || !strings(row.manipulation_signs, 0, 10) || !traceOk(row.trace)) return null;
  const reasons = row.reasons;
  const manipulationSigns = row.manipulation_signs;
  if (unsafe([...reasons, ...manipulationSigns].join(" "))) return null;
  return { level, reasons, manipulationSigns, source: "agent" };
}

/** Ask the model after the rule exists. Any failure, or a disabled agent, keeps the rule wording. */
export async function enrichMessageScan(text: string, cif?: string): Promise<MessageScan> {
  const rule = ruleScan(text);
  if (!fraudAgentEnabled()) return rule;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const note = (trace: unknown, output: string) => { if (cif) recordAiJournal(cif, "scan", null, toolNames(trace), output); };
  try {
    const response = await Promise.race([
      forwardToAgent("/fraud/scan", {
        text: redactSecurityText(text),
        rule: { level: TO_AGENT[rule.level], reasons: rule.reasons.slice(0, 10) },
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 7_000); }),
    ]);
    const body: unknown = response.ok ? await response.json().catch(() => null) : null;
    const agent = asAgent(body, rule.level);
    note(body && typeof body === "object" ? (body as { trace?: unknown }).trace : null, agent ? clipOutput(agent.reasons.join(" ")) : "thất bại");
    if (!fraudAgentEnabled()) return rule;
    return agent ?? rule;
  } catch {
    note(null, "thất bại");
    return rule;
  } finally { if (timer) clearTimeout(timer); }
}
