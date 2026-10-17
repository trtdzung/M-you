import { MAX_VND } from "@/domain/models/asset-liability-input";
import type {
  FieldErrors,
  GoalLedgerKind,
  LedgerEntryInput,
  ValidationResult,
} from "./types";

const KINDS: readonly string[] = ["deposit", "withdraw"];

export function validateLedgerEntry(
  input: unknown,
): ValidationResult<LedgerEntryInput> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const kind =
    typeof raw.kind === "string" && KINDS.includes(raw.kind)
      ? (raw.kind as GoalLedgerKind)
      : undefined;
  if (!kind) errors.kind = "Loại giao dịch không hợp lệ";

  const amount = raw.amount;
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > MAX_VND
  ) {
    errors.amount = "Số tiền phải là số nguyên dương hợp lệ";
  }

  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (kind === "withdraw" && note === "") {
    errors.note = "Cần nhập câu cam kết khi rút";
  }

  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };
  return {
    ok: true,
    errors,
    value: { kind: kind!, amount: amount as number, note: note === "" ? null : note },
  };
}
