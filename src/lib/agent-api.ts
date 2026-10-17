/**
 * Client for the real M-You agent, proxied through `src/app/api/agent/chat`
 * (same-origin — the client never sees `AGENT_API_KEY`/Auth0 credentials,
 * see `route.ts`). `UiPayload` is a discriminated union the agent may return
 * alongside `answer` — `ChartUi` (Feature 2) and `TransferFormUi` (Feature 3)
 * today, `{ type: string }` as a catch-all for future/unsupported types
 * (Feature 4 adds its own variant here without changing this file's other
 * exports).
 */

import { CATEGORY_BY_ID } from "@/domain/models";

const PROXY_PATH = "/api/agent/chat";

export interface ChartUi {
  type: "chart";
  chart_type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  series: { name: string; data: number[] }[];
}

/**
 * A proposal to transfer money to a recipient already in the customer's
 * saved beneficiaries (`GET /api/beneficiaries` — see
 * `backend_docs/pfm-read-api.md`). The agent never invents a recipient: it
 * only returns `beneficiary_id`, which the UI resolves against `pfm`'s own
 * beneficiaries data for the real name/account number/bank (never trusting
 * the agent to relay those directly — invariant #3, no fabricated accounts).
 */
export interface TransferFormUi {
  type: "transfer_form";
  beneficiary_id: string;
  amount: number;
  note: string;
  category: string;
}

/**
 * Jar proposals (Feature 4, contract in `backend_docs/pfm-read-api.md` B2–B4).
 * The agent only proposes; `pfm` performs the change after the customer confirms.
 * Amounts are VND; jar ids come from `GET /api/jar-summary` — the agent never
 * relays names, so a stale or unknown id is caught when the card resolves it.
 */
export interface CreateJarUi {
  type: "create_jar";
  jar_name: string;
  allocation_amount: number;
  category_ids: string[];
  reason: string;
}

export interface EditJarUi {
  type: "edit_jar";
  jar_id: string;
  jar_name: string;
  allocation_amount: number;
  /** The jar's COMPLETE new category list; absent = unchanged. */
  category_ids?: string[];
  reason: string;
}

export interface RebalanceMove {
  /** A jar id, or `"pool"` for the derived "Chưa phân bổ". */
  from_jar_id: string;
  amount: number;
}

export interface RebalanceJarsUi {
  type: "rebalance_jars";
  target_jar_id: string;
  shortfall: number;
  moves: RebalanceMove[];
  reason: string;
}

export type JarUi = CreateJarUi | EditJarUi | RebalanceJarsUi;

export type UiPayload = ChartUi | TransferFormUi | JarUi | { type: string } | null;

/**
 * True only for a `ui.type === "chart"` payload that is actually safe to
 * render: `chart_type` is one of the 3 supported kinds, and every series'
 * `data` length matches `labels` length. The agent's `ui` field is model-
 * generated and not schema-enforced end to end (see chart-visualization.md)
 * — never throws, so a malformed/unsupported payload just falls back to
 * showing `answer` alone.
 */
export function isChartUi(ui: UiPayload | null | undefined): ui is ChartUi {
  if (!ui || ui.type !== "chart") return false;
  const c = ui as Partial<ChartUi>;
  if (typeof c.title !== "string") return false;
  if (!Array.isArray(c.labels) || !c.labels.every((l) => typeof l === "string")) return false;
  if (c.chart_type !== "bar" && c.chart_type !== "line" && c.chart_type !== "pie") return false;
  if (!Array.isArray(c.series) || c.series.length === 0) return false;
  return c.series.every(
    (s) =>
      s &&
      typeof s.name === "string" &&
      Array.isArray(s.data) &&
      s.data.length === c.labels!.length &&
      s.data.every((n) => typeof n === "number"),
  );
}

/**
 * True only for a `ui.type === "transfer_form"` payload with all 4 required
 * fields present and well-typed, `amount > 0`, `category` a known expense
 * category id. Same reliability posture as `isChartUi`: the agent's `ui`
 * field is model-generated, so a malformed payload never throws — it just
 * falls back to showing `answer` alone. This only validates SHAPE —
 * `beneficiary_id` matching a real saved beneficiary is checked separately
 * by `AgentTransferFormCard` (it needs the live beneficiaries list to do so).
 *
 * `expenseIds` is the whitelist the agent's `category` is checked against
 * (invariant #2 — the model's answer is validated, never trusted). Callers pass
 * the persona's STORED assignable ids (`useCategories()`); without them the
 * bundled presets stand in, which silently rejects every category the user
 * created. It is only ever narrowed, never widened: an id outside the set means
 * the card does not render, and no money is ever moved by this function.
 */
export function isTransferFormUi(
  ui: UiPayload | null | undefined,
  expenseIds?: ReadonlySet<string>,
): ui is TransferFormUi {
  if (!ui || ui.type !== "transfer_form") return false;
  const f = ui as Partial<TransferFormUi>;
  const knownExpense = (id: string) =>
    expenseIds ? expenseIds.has(id) : CATEGORY_BY_ID[id]?.kind === "expense";
  return (
    typeof f.beneficiary_id === "string" &&
    f.beneficiary_id.trim() !== "" &&
    typeof f.amount === "number" &&
    Number.isFinite(f.amount) &&
    f.amount > 0 &&
    typeof f.note === "string" &&
    typeof f.category === "string" &&
    knownExpense(f.category)
  );
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Every id a known expense category of THIS persona, no repeats (same whitelist rule as `isTransferFormUi`). */
function validCategoryIds(ids: unknown, expenseIds?: ReadonlySet<string>): ids is string[] {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return false;
  if (new Set(ids).size !== ids.length) return false;
  return ids.every((id) => (expenseIds ? expenseIds.has(id) : CATEGORY_BY_ID[id]?.kind === "expense"));
}

/**
 * `create_jar` shape: `jar_name`, `allocation_amount > 0`, `category_ids` (may be
 * `[]`), `reason`; a `jar_id` is NOT allowed (`pfm` mints the id). Shape only —
 * headroom, duplicate names and category ownership are re-checked by the card
 * against live data. Never throws; a bad payload just falls back to `answer`.
 */
export function isCreateJarUi(ui: UiPayload | null | undefined, expenseIds?: ReadonlySet<string>): ui is CreateJarUi {
  if (!ui || ui.type !== "create_jar") return false;
  const f = ui as Partial<CreateJarUi> & { jar_id?: unknown };
  return (
    f.jar_id === undefined &&
    nonEmpty(f.jar_name) &&
    positive(f.allocation_amount) &&
    validCategoryIds(f.category_ids, expenseIds) &&
    nonEmpty(f.reason)
  );
}

/** `edit_jar` shape: `jar_id`, `jar_name`, `allocation_amount > 0`, optional full `category_ids`, `reason`. */
export function isEditJarUi(ui: UiPayload | null | undefined, expenseIds?: ReadonlySet<string>): ui is EditJarUi {
  if (!ui || ui.type !== "edit_jar") return false;
  const f = ui as Partial<EditJarUi>;
  return (
    nonEmpty(f.jar_id) &&
    nonEmpty(f.jar_name) &&
    positive(f.allocation_amount) &&
    (f.category_ids === undefined || validCategoryIds(f.category_ids, expenseIds)) &&
    nonEmpty(f.reason)
  );
}

/**
 * `rebalance_jars` shape — the checks that need no live data (contract "quy tắc
 * cứng" 1–2): fields well-typed, Σ `moves[].amount` equals `shortfall`, no source
 * equals the target or repeats, target is not `"pool"`. Caps against real balances
 * are checked by `AgentRebalanceCard` (it needs the jar snapshot).
 */
export function isRebalanceJarsUi(ui: UiPayload | null | undefined): ui is RebalanceJarsUi {
  if (!ui || ui.type !== "rebalance_jars") return false;
  const f = ui as Partial<RebalanceJarsUi>;
  if (!nonEmpty(f.target_jar_id) || f.target_jar_id === "pool" || !positive(f.shortfall) || !nonEmpty(f.reason)) return false;
  if (!Array.isArray(f.moves) || f.moves.length === 0) return false;
  const seen = new Set<string>();
  let sum = 0;
  for (const m of f.moves) {
    if (!m || !nonEmpty(m.from_jar_id) || !positive(m.amount)) return false;
    if (m.from_jar_id === f.target_jar_id || seen.has(m.from_jar_id)) return false;
    seen.add(m.from_jar_id);
    sum += m.amount;
  }
  return Math.abs(sum - f.shortfall) < 0.5;
}

/** Any of the three jar proposals (create / edit / rebalance). */
export function isJarUi(ui: UiPayload | null | undefined, expenseIds?: ReadonlySet<string>): ui is JarUi {
  return isCreateJarUi(ui, expenseIds) || isEditJarUi(ui, expenseIds) || isRebalanceJarsUi(ui);
}

export interface ChatResponse {
  answer: string;
  thread_id: string;
  ui?: UiPayload;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  ui: UiPayload;
}

export interface ChatHistoryResponse {
  thread_id: string;
  messages: HistoryMessage[];
}

async function readJsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    throw new Error(`Agent API error ${res.status}`);
  }
  return res.json();
}

export async function sendChatMessage(message: string, cif: string): Promise<ChatResponse> {
  const res = await fetch(PROXY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, user_id: cif }),
  });
  return readJsonOrThrow(res) as Promise<ChatResponse>;
}

export async function getChatHistory(cif: string): Promise<ChatHistoryResponse> {
  const res = await fetch(`${PROXY_PATH}?user_id=${encodeURIComponent(cif)}`);
  return readJsonOrThrow(res) as Promise<ChatHistoryResponse>;
}

export async function deleteChatHistory(cif: string): Promise<void> {
  const res = await fetch(`${PROXY_PATH}?user_id=${encodeURIComponent(cif)}`, { method: "DELETE" });
  await readJsonOrThrow(res);
}

/**
 * Ask the agent how to fund a jar that is short for a planned spend
 * (`POST /jar-rebalance`, mode `cover`) — no chat thread involved. `ui` is
 * `rebalance_jars` or `null` (nothing to propose; `answer` says why).
 */
export async function requestJarCover(input: { cif: string; targetJarId: string; spendAmount: number }): Promise<ChatResponse> {
  const res = await fetch("/api/agent/jar-rebalance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: input.cif, target_jar_id: input.targetJarId, spend_amount: input.spendAmount }),
  });
  return readJsonOrThrow(res) as Promise<ChatResponse>;
}
