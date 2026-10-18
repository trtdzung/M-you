import { SCENARIO_COPY } from "./scenario-copy";

// Keep the fixed rule questions in the exact order and wording of SC2.
export const CASE_FIELDS = SCENARIO_COPY.SC2.message.split(": ")[1].split(" → ")[0].split(", ");
export const CASE_DOSSIER_TITLE = SCENARIO_COPY.SC2.message.split(" → ")[1].split(". ")[0];
export const CASE_GUIDANCE = SCENARIO_COPY.SC2.message.split(". ")[1];
export type CaseAttachment = { name: string; mime: "image/png" | "image/jpeg" | "image/webp"; base64: string };
export type FraudCase = {
  id: string; status: "draft" | "submitted" | "updated"; openedAt: number; updatedAt: number;
  answers: string[]; dossier: Record<string, string> | null; attachments: CaseAttachment[];
};
export const MAX_CASE_IMAGE_BYTES = 2 * 1024 * 1024;
