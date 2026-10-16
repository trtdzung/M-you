const VOICE_DRAFT_KEY = "msb-pfm.voice-assistant-draft";

/** Keep spoken financial text out of the URL while handing it between overlays. */
export function putVoiceAssistantDraft(text: string) {
  if (typeof window === "undefined") return;
  const clean = text.trim();
  if (clean) window.sessionStorage.setItem(VOICE_DRAFT_KEY, clean);
}

export function takeVoiceAssistantDraft() {
  if (typeof window === "undefined") return "";
  const value = window.sessionStorage.getItem(VOICE_DRAFT_KEY)?.trim() ?? "";
  window.sessionStorage.removeItem(VOICE_DRAFT_KEY);
  return value;
}
