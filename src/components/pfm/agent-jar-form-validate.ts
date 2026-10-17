/**
 * Pure checks for `AgentJarFormCard` (the agent's create/edit jar proposal),
 * run at the click against a FRESH jar list. Two axes (plan 260923):
 *  - HẠN MỨC (`limit`): the monthly plan. Any value > 0 is fine — it moves no
 *    money, so it is never checked against the account (an edit may raise it
 *    above CASA).
 *  - SỐ DƯ BAN ĐẦU (create only): money taken from "Chờ phân bổ". Required — empty
 *    is an error, never read as 0 (invariant #6); 0 is allowed; > 0 must fit the
 *    pool, which must be known. The server re-checks the cap (422 `overBy`).
 */

import type { JarConfig } from "@/domain/models";
import { categoryLabel } from "@/domain/models";
import { KHAC_JAR_ID } from "@/domain/engine";
import { isJarAmount } from "@/domain/jar-rules";
import { formatVnd } from "@/lib/format";
import { allocatableFromPool, type CurrentJarFunds } from "@/state/use-current-jar-funds";
import { parseVndInput } from "@/components/settings/parse-vnd-input";

export interface AgentJarFormDraft {
  isEdit: boolean;
  /** The edited jar's id (edit only) — excluded from the duplicate-name check. */
  jarId?: string;
  name: string;
  limit: number;
  /** Raw "Số dư ban đầu" text (create only). */
  balanceRaw: string;
  selected: string[];
}

export type AgentJarFormResult =
  | { ok: true; label: string; limit: number; balance: number | null }
  | { ok: false; error: string; drop?: string[] };

/** What a create may take from the pool now, or `null` when unknown/not loaded. */
function availableOf(funds: CurrentJarFunds): number | null {
  return funds.status === "ready" ? allocatableFromPool(funds.pool) : null;
}

/** One-line pool state shown under the balance field (loading / unknown / amount). */
export function poolHint(funds: CurrentJarFunds): string {
  if (funds.status === "loading") return "Đang tải số tiền chờ phân bổ…";
  if (funds.status === "error") return "Không tải được số dư tài khoản — chỉ tạo được hũ với số dư 0.";
  const available = availableOf(funds);
  return available === null
    ? "Chưa có số dư tài khoản — chỉ tạo được hũ với số dư 0."
    : `Chờ phân bổ: ${formatVnd(available)}`;
}

/** Parse the required opening balance; empty/invalid → a Vietnamese error. */
function parseBalance(raw: string): { value: number } | { error: string } {
  const parsed = parseVndInput(raw);
  if (parsed.kind === "empty") return { error: "Nhập số dư ban đầu (nhập 0 nếu chưa nạp)." };
  if (parsed.kind === "error") return { error: `Số dư: ${parsed.message}` };
  if (!isJarAmount(parsed.value)) return { error: "Số dư: Số tiền quá lớn" };
  return { value: parsed.value };
}

export function validateAgentJarForm(
  cfg: JarConfig,
  draft: AgentJarFormDraft,
  funds: CurrentJarFunds,
  labels?: ReadonlyMap<string, string>,
): AgentJarFormResult {
  const label = draft.name.trim();
  if (!label) return { ok: false, error: "Nhập tên hũ." };
  const sameName = cfg.jars.find(
    (j) => j.id !== draft.jarId && j.label.trim().toLowerCase() === label.toLowerCase(),
  );
  if (sameName) return { ok: false, error: `Đã có hũ tên "${sameName.label}". Đặt tên khác.` };

  if (!draft.isEdit) {
    // A create must not take a category out of another jar.
    const taken = draft.selected.flatMap((id) => {
      const owner = cfg.jars.find((j) => j.categoryIds.includes(id));
      return owner && owner.id !== KHAC_JAR_ID ? [{ id, owner: owner.label }] : [];
    });
    if (taken.length > 0) {
      return {
        ok: false,
        error: `${taken.map((t) => `${categoryLabel(t.id, labels)} đã thuộc hũ ${t.owner}`).join("; ")} nên đã bỏ khỏi lựa chọn. Kiểm tra lại rồi bấm Tạo hũ.`,
        drop: taken.map((t) => t.id),
      };
    }
  }

  if (!Number.isFinite(draft.limit) || draft.limit <= 0) return { ok: false, error: "Hạn mức phải lớn hơn 0." };
  if (!isJarAmount(draft.limit)) return { ok: false, error: "Hạn mức phải là số tiền nguyên, không quá lớn." };
  if (draft.isEdit) return { ok: true, label, limit: draft.limit, balance: null };

  const balance = parseBalance(draft.balanceRaw);
  if ("error" in balance) return { ok: false, error: balance.error };
  if (balance.value > 0) {
    if (funds.status === "loading") return { ok: false, error: "Đang tải số tiền chờ phân bổ, thử lại sau giây lát." };
    const available = availableOf(funds);
    if (available === null) return { ok: false, error: poolHint(funds) };
    if (balance.value > available) {
      return { ok: false, error: `Số dư ban đầu vượt số tiền chờ phân bổ (còn ${formatVnd(available)}).` };
    }
  }
  return { ok: true, label, limit: draft.limit, balance: balance.value };
}
