/** "Chưa rõ? Để M-You ước tính": gọi route proxy sang agent. Hai bước: lấy form để tick, rồi tra giá theo các lựa chọn. */

export interface PriceQuestion {
  id: string;
  title: string;
  options: string[];
  multi: boolean;
}

export interface PriceEstimate {
  amount: number;
  low: number;
  high: number;
  summary: string;
  sources: { title: string; url: string }[];
}

export type PriceAnswers = Record<string, string[]>;

interface PriceReply {
  questions?: PriceQuestion[];
  estimate?: PriceEstimate;
  reason?: string;
  degraded?: boolean;
}

async function call(payload: Record<string, unknown>, signal?: AbortSignal): Promise<PriceReply> {
  const res = await fetch("/api/goals-v2/price-estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`price estimate ${res.status}`);
  return (await res.json()) as PriceReply;
}

export async function fetchPriceQuestions(cif: string, template: string, description: string, signal?: AbortSignal): Promise<PriceQuestion[]> {
  const reply = await call({ cif, template, description }, signal);
  if (!reply.questions?.length) throw new Error("no questions");
  return reply.questions;
}

/** `null`: agent chạy xong nhưng chưa tìm đủ giá để đề xuất. */
export async function fetchPriceEstimate(
  cif: string,
  template: string,
  description: string,
  answers: PriceAnswers,
  refresh: boolean,
  signal?: AbortSignal,
): Promise<PriceEstimate | null> {
  const reply = await call({ cif, template, description, answers, refresh }, signal);
  return reply.estimate ?? null;
}
