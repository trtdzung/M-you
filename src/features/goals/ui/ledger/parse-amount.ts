import { parseVndInput } from "@/components/settings/parse-vnd-input";

/** Raw money text -> positive amount; blank gives neither value nor error. */
export function parseAmount(raw: string): { value?: number; error?: string } {
  const parsed = parseVndInput(raw);
  if (parsed.kind === "empty") return {};
  if (parsed.kind === "error") return { error: parsed.message };
  if (parsed.value <= 0) return { error: "Số tiền phải lớn hơn 0" };
  return { value: parsed.value };
}
