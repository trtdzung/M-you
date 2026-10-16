/**
 * Deterministic markdown → plain-text guard. The chat UI renders text verbatim
 * (no markdown parser), so any `**bold**`, `# heading` or `- bullet` the model
 * emits would show as literal characters. The system prompt asks for plain text;
 * this is the hard guarantee behind that soft rule — applied to the final answer
 * before it streams. Kept conservative: it strips markers, never numbers, so it
 * cannot alter a grounded figure (single `*`/`_` italics are left untouched on
 * purpose to avoid touching numeric expressions).
 */

export function toPlainText(text: string): string {
  return text
    .replace(/```[a-zA-Z0-9]*\n?/g, "") // code fences
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/(\*\*|__)(.+?)\1/gs, "$2") // bold
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^(\s*)[-*+]\s+/gm, "$1• "); // bullets → •
}
