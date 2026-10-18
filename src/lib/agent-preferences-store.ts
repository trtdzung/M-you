import "server-only";

/**
 * Read/write access to the `agent_preferences` table (`data/schema.md`). Server
 * only — imported by `src/app/api/agent-preferences/route.ts`, never by client
 * code (architectural invariant #4). One row per persona (`cif`); a missing row
 * reads back as `EMPTY_AGENT_PREFERENCES` (every field unset, never guessed).
 */

import { AGENT_PREFERENCES_MAX, EMPTY_AGENT_PREFERENCES, type AgentPreferences } from "@/domain/models";
import { getDb } from "./db";
import { transferNow } from "./demo-clock";

interface Row {
  cif: string;
  response_length: string | null;
  tone: string | null;
  risk_appetite: string | null;
  address_as: string;
  about: string;
  notes: string;
  updated_at: string;
}

const RESPONSE_LENGTHS = new Set(["concise", "balanced", "detailed"]);
const TONES = new Set(["friendly", "formal", "playful"]);
const RISK_APPETITES = new Set(["cautious", "balanced", "aggressive"]);

function toPreferences(row: Row | undefined): AgentPreferences {
  if (!row) return EMPTY_AGENT_PREFERENCES;
  return {
    responseLength: (row.response_length as AgentPreferences["responseLength"]) ?? null,
    tone: (row.tone as AgentPreferences["tone"]) ?? null,
    riskAppetite: (row.risk_appetite as AgentPreferences["riskAppetite"]) ?? null,
    addressAs: row.address_as,
    about: row.about,
    notes: row.notes,
  };
}

/** The persona's standing preferences, or every field unset if none were ever saved. */
export function readAgentPreferences(cif: string): AgentPreferences {
  const row = getDb().prepare("SELECT * FROM agent_preferences WHERE cif = ?").get(cif) as Row | undefined;
  return toPreferences(row);
}

/** `null`/absent enum = "chưa chọn"; a present-but-unknown value is rejected (never silently dropped). */
function sanitizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<string>, field: string): T | null | { error: string } {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !allowed.has(value)) return { error: `${field} không hợp lệ` };
  return value as T;
}

function sanitizeText(value: unknown, field: string, max: number): string | { error: string } {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return { error: `${field} không hợp lệ` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { error: `${field} tối đa ${max} ký tự` };
  return trimmed;
}

/**
 * Validate a `PUT /api/agent-preferences` body into a clean `AgentPreferences`
 * (every string trimmed, enums checked against the fixed sets, free text
 * capped — `AGENT_PREFERENCES_MAX`). Never throws; a bad field is the caller's
 * 422 reason, not a silently dropped/guessed value.
 */
export function sanitizeAgentPreferences(body: unknown): AgentPreferences | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const responseLength = sanitizeEnum(b.responseLength, RESPONSE_LENGTHS, "Độ dài câu trả lời");
  if (responseLength && typeof responseLength === "object") return responseLength;
  const tone = sanitizeEnum(b.tone, TONES, "Giọng điệu");
  if (tone && typeof tone === "object") return tone;
  const riskAppetite = sanitizeEnum(b.riskAppetite, RISK_APPETITES, "Khẩu vị rủi ro");
  if (riskAppetite && typeof riskAppetite === "object") return riskAppetite;
  const addressAs = sanitizeText(b.addressAs, "Cách xưng hô", AGENT_PREFERENCES_MAX.addressAs);
  if (typeof addressAs === "object") return addressAs;
  const about = sanitizeText(b.about, "Về bạn", AGENT_PREFERENCES_MAX.about);
  if (typeof about === "object") return about;
  const notes = sanitizeText(b.notes, "Hướng dẫn khác", AGENT_PREFERENCES_MAX.notes);
  if (typeof notes === "object") return notes;
  return {
    responseLength: responseLength as AgentPreferences["responseLength"],
    tone: tone as AgentPreferences["tone"],
    riskAppetite: riskAppetite as AgentPreferences["riskAppetite"],
    addressAs,
    about,
    notes,
  };
}

/** Upsert the whole row (the settings sheet always saves every field together — no partial PATCH). */
export function writeAgentPreferences(cif: string, prefs: AgentPreferences): AgentPreferences {
  getDb()
    .prepare(
      `INSERT INTO agent_preferences (cif, response_length, tone, risk_appetite, address_as, about, notes, updated_at)
       VALUES (@cif, @responseLength, @tone, @riskAppetite, @addressAs, @about, @notes, @updatedAt)
       ON CONFLICT(cif) DO UPDATE SET
         response_length = excluded.response_length,
         tone = excluded.tone,
         risk_appetite = excluded.risk_appetite,
         address_as = excluded.address_as,
         about = excluded.about,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
    )
    .run({ cif, ...prefs, updatedAt: transferNow().toISOString() });
  return readAgentPreferences(cif);
}
