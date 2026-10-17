import type { HomeInsight } from "./home-contract";

const key = (cif: string) => `pfm.insight-draft:${cif}`;

export function saveInsightDraft(cif: string, insight: HomeInsight): boolean {
  const c = insight.candidate;
  const visibleText = c.question;
  const hiddenSeed = `\n\nBối cảnh từ Home ngày ${insight.asOf}: ${c.metric.label}: ${c.metric.value.toLocaleString("vi-VN")} VND (${c.confidence === "estimated" ? "ước tính" : "theo dữ liệu đã ghi nhận"}). Các dữ kiện: ${JSON.stringify(c.facts)}. Hãy kiểm tra dữ liệu hiện tại trước khi tư vấn; đây chưa phải yêu cầu thực hiện giao dịch.`;
  const draft = visibleText + hiddenSeed;
  try {
    sessionStorage.setItem(key(cif), JSON.stringify({ draft, visibleText, expires: Date.now() + 15 * 60_000 }));
    return true;
  } catch { return false; }
}

export interface InsightDraftPayload {
  draft: string;      // full message to send to agent (includes hidden context)
  visibleText: string; // text to show in UI bubble
}

export function takeInsightDraft(cif: string): InsightDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(key(cif));
    sessionStorage.removeItem(key(cif));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      !value ||
      value.expires <= Date.now() ||
      typeof value.draft !== "string" ||
      value.draft.length > 5000
    ) return null;
    const visibleText = typeof value.visibleText === "string" ? value.visibleText : value.draft;
    return { draft: value.draft, visibleText };
  } catch { return null; }
}
