import type { SpeechSessionOptions } from "./speech-types";

interface JarSpeechSource {
  id: string;
  label: string;
}

/** Build a small, closed vocabulary for speech recognition and safe refinement. */
export function jarSpeechKeyterms(labels: string[]): string[] {
  const terms = ["hũ"];
  for (const label of labels) {
    const clean = label.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    terms.push(clean, `hũ ${clean}`);
  }
  return [...new Map(terms.map((term) => [term.toLocaleLowerCase("vi"), term])).values()].slice(0, 20);
}

/**
 * Send the current customer's jars as typed entities. Nothing in this context
 * assumes default jar names, so renamed and newly created jars take effect on
 * the next microphone session without a deployment.
 */
export function jarSpeechContext(jars: JarSpeechSource[]): Required<Pick<
  SpeechSessionOptions,
  "keyterms" | "entities" | "intents"
>> {
  const cleanJars = jars
    .map((jar) => ({ id: jar.id.trim(), label: jar.label.trim().replace(/\s+/g, " ") }))
    .filter((jar) => jar.id && jar.label)
    .slice(0, 20);
  return {
    keyterms: jarSpeechKeyterms(cleanJars.map((jar) => jar.label)),
    entities: cleanJars.map((jar) => ({
      id: jar.id,
      type: "budget_jar",
      label: jar.label,
      aliases: [`hũ ${jar.label}`],
    })),
    intents: ["transfer_between_jars"],
  };
}
