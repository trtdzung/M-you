import { describe, expect, it } from "vitest";
import { jarSpeechContext, jarSpeechKeyterms } from "./speech-context";

describe("dynamic speech context", () => {
  it("derives vocabulary and typed entities from current custom jars", () => {
    const context = jarSpeechContext([
      { id: "trip-bali", label: " Du lịch Bali " },
      { id: "family", label: "Gia đình" },
    ]);
    expect(context.keyterms).toEqual(["hũ", "Du lịch Bali", "hũ Du lịch Bali", "Gia đình", "hũ Gia đình"]);
    expect(context.entities).toEqual([
      { id: "trip-bali", type: "budget_jar", label: "Du lịch Bali", aliases: ["hũ Du lịch Bali"] },
      { id: "family", type: "budget_jar", label: "Gia đình", aliases: ["hũ Gia đình"] },
    ]);
    expect(context.intents).toEqual(["transfer_between_jars"]);
  });

  it("does not inject a fixed default jar name", () => {
    expect(jarSpeechKeyterms(["Tự do tài chính"])).toEqual(["hũ", "Tự do tài chính", "hũ Tự do tài chính"]);
  });
});
