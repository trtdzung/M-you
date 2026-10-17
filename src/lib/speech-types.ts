export type SpeechEndpointing = "silence" | "manual";

export interface SpeechContextEntity {
  id: string;
  type: string;
  label: string;
  aliases: string[];
}

export interface SpeechIntentSlot {
  name: string;
  value: string | number | boolean | null;
  entity_id: string | null;
  source_text: string | null;
  confidence: number;
}

export interface SpeechIntentInterpretation {
  intent: string;
  status: "complete" | "incomplete" | "ambiguous";
  confidence: number;
  actionable: boolean;
  negated: boolean;
  slots: SpeechIntentSlot[];
  missing_slots: string[];
  ambiguous_slots: string[];
  clarification: string | null;
}

export interface SpeechFinalMetadata {
  rawText: string;
  refinementStatus: "disabled" | "refined" | "unchanged" | "fallback" | "skipped";
  interpretation?: SpeechIntentInterpretation;
}

export interface SpeechSessionOptions {
  keyterms?: string[];
  endpointing?: SpeechEndpointing;
  entities?: SpeechContextEntity[];
  intents?: string[];
}

export type SpeechTranscriptCallback = (
  text: string,
  final: boolean,
  metadata?: SpeechFinalMetadata,
) => void;
