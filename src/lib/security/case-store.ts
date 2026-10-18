import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { engineNow } from "./clock";
import { openInterventions, markAnswered } from "./intervention-store";
import { eventsSince, recordEvent } from "./events";
import { SCENARIO_COPY } from "./scenario-copy";
import { CASE_FIELDS, type FraudCase, type CaseAttachment } from "./case-types";

interface Row { id: string; status: FraudCase["status"]; opened_at: number; updated_at: number; answers: string; dossier: string | null; attachments: string | null }
const decode = (row: Row): FraudCase => ({ id: row.id, status: row.status, openedAt: row.opened_at, updatedAt: row.updated_at,
  answers: JSON.parse(row.answers), dossier: row.dossier ? JSON.parse(row.dossier) : null, attachments: JSON.parse(row.attachments ?? "[]") });

/** Materialize the case IDs reserved by SC1, retaining their original incident time. */
function materialize(cif: string) {
  for (const event of eventsSince(cif, 0, ["case_opened"])) {
    const caseId = (event.payload as { caseId: string }).caseId;
    getDb().prepare("INSERT OR IGNORE INTO fraud_cases (id,cif,status,opened_at,updated_at,answers,attachments) VALUES (?,?,'draft',?,?,?,?)")
      .run(caseId, cif, event.at, event.at, JSON.stringify(Array(CASE_FIELDS.length).fill("")), "[]");
  }
}
export function readCases(cif: string): FraudCase[] {
  materialize(cif);
  return (getDb().prepare("SELECT * FROM fraud_cases WHERE cif=? ORDER BY opened_at DESC,rowid DESC").all(cif) as Row[]).map(decode);
}
export function readCase(cif: string, id: string): FraudCase | null {
  const row = getDb().prepare("SELECT * FROM fraud_cases WHERE cif=? AND id=?").get(cif, id) as Row | undefined;
  return row ? decode(row) : null;
}
export function openCase(cif: string): FraudCase {
  return getDb().transaction(() => {
    for (const item of openInterventions(cif).filter(i => i.scenario === "SC1")) {
      const choice = SCENARIO_COPY.SC2.situation;
      if (markAnswered(cif, item.id, choice, engineNow(cif).getTime())) recordEvent(cif, "intervention_answered", { interventionId: item.id, scenario: "SC1", choice });
    }
    const latest = readCases(cif)[0];
    if (latest) return latest;
    const id = randomUUID();
    recordEvent(cif, "case_opened", { caseId: id });
    materialize(cif);
    return readCase(cif, id)!;
  })();
}
export function saveCase(cif: string, id: string, patch: { answers?: string[]; attachment?: CaseAttachment; submit?: boolean; update?: boolean; guidance?: string }): FraudCase | null {
  return getDb().transaction(() => {
    const item = readCase(cif, id);
    if (!item) return null;
    const answers = patch.answers ?? item.answers;
    const attachments = patch.attachment ? [...item.attachments, patch.attachment] : item.attachments;
    if (attachments.length > 3) throw new Error("attachment limit");
    if (patch.attachment) answers[4] = attachments.map(a => a.name).join(", ");
    if (patch.submit && answers.some(a => !a.trim())) throw new Error("incomplete case");
    const now = engineNow(cif).getTime();
    const prior = item.dossier && typeof item.dossier.guidance === "string" ? item.dossier.guidance : "";
    const guidance = typeof patch.guidance === "string" ? patch.guidance.trim().slice(0, 1000) : prior;
    const complete = answers.every(value => value.trim());
    const filed = Object.fromEntries(CASE_FIELDS.map((field, i) => [field, answers[i]]));
    const dossier = patch.submit || (Boolean(patch.guidance) && complete) ? (guidance ? { ...filed, guidance } : filed) : item.dossier;
    const status = patch.update ? "updated" : patch.submit ? "submitted" : item.status;
    getDb().prepare("UPDATE fraud_cases SET answers=?,attachments=?,dossier=?,status=?,updated_at=? WHERE cif=? AND id=?")
      .run(JSON.stringify(answers), JSON.stringify(attachments), dossier ? JSON.stringify(dossier) : null, status, now, cif, id);
    if (patch.update) recordEvent(cif, "family_push", { message: `${SCENARIO_COPY.SC3.message} (giả lập)`, scenario: "SC3" }, now);
    return readCase(cif, id);
  })();
}
