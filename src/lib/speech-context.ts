/** Build a small, closed vocabulary for speech recognition and safe refinement. */
export function jarSpeechKeyterms(labels: string[]): string[] {
  const terms = ["hũ", "hũ chi tiêu"];
  for (const label of labels) {
    const clean = label.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    terms.push(clean, `hũ ${clean}`);
  }
  return [...new Map(terms.map((term) => [term.toLocaleLowerCase("vi"), term])).values()].slice(0, 20);
}
