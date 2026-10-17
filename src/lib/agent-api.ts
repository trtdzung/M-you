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
import { isJarAmount } from "@/domain/jar-rules";

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
  /** HẠN MỨC tháng (monthly plan, resets each month) — NOT money in the jar. */
  allocation_amount: number;
  /**
   * SỐ DƯ BAN ĐẦU (opening balance, whole VND ≥ 0) taken from "Chưa phân bổ".
   * REQUIRED (plan 260923 D5): a payload without it is rejected, never read as 0
   * (invariant #6). `0` is an explicit, allowed value.
   */
  initial_balance: number;
  category_ids: string[];
  reason: string;
}

export interface EditJarUi {
  type: "edit_jar";
  jar_id: string;
  jar_name: string;
  /** New HẠN MỨC tháng — an edit never moves the jar's balance. */
  allocation_amount: number;
  /** The jar's COMPLETE new category list; absent = unchanged. */
  category_ids?: string[];
  reason: string;
}

/** One receiving jar of a `rebalance_jars` / `distribute_amount` proposal. */
export interface JarAllocation {
  /** A jar id from `jar-summary` (never `"pool"`). */
  to_jar_id: string;
  /** Whole VND added to that jar's BALANCE (never its limit). */
  amount: number;
}

/**
 * `rebalance_jars` (contract 2026-09-24, `agent_backend_docs/jars/rebalance-jars.md`):
 * ONE source jar gives BALANCE to one or more other jars. The pre-2026-09-24 shape
 * (`target_jar_id` + `shortfall` + `moves[]`, a `"pool"` source) is gone.
 */
export interface RebalanceJarsUi {
  type: "rebalance_jars";
  from_jar_id: string;
  allocations: JarAllocation[];
  reason: string;
}

/**
 * `distribute_amount` (`agent_backend_docs/jars/distribute-amount.md`): hand out
 * money from "Chưa phân bổ" into one or more jars as BALANCE. Same allocation
 * list as `rebalance_jars`, no source jar — the source is always the unallocated pool.
 */
export interface DistributeAmountUi {
  type: "distribute_amount";
  allocations: JarAllocation[];
  reason: string;
}

export type JarUi = CreateJarUi | EditJarUi | RebalanceJarsUi | DistributeAmountUi;

/**
 * "Hỏi lại bằng nút bấm" (cross-cutting, `agent_backend_docs/clarify-options.md`):
 * the agent could not decide on its own and asks the customer to pick, from 1–4
 * INDEPENDENT questions in the same turn (like Claude's own `AskUserQuestion` —
 * several things may genuinely need deciding at once). `answer` is always a short
 * lead-in ("Bạn hãy trả lời các câu hỏi sau…"), never the question text itself —
 * that lives in `questions[].question`; a caller renders BOTH. Each option is a
 * plain string (no id) — picking (or typing) sends it verbatim as a normal
 * `/chat` message; there is no separate "answer" mechanism. With exactly one
 * question, a pick is sent immediately. With several, the customer answers every
 * question first, then ALL picks are joined into ONE message (see `joinClarifyAnswers`).
 */
export interface ClarifyQuestion {
  question: string;
  options: string[];
}

export interface ClarifyOptionsUi {
  type: "clarify_options";
  questions: ClarifyQuestion[];
}

/**
 * Combine one answer per question of a multi-question `clarify_options` turn into
 * the single `/chat` message the contract requires: each answer followed by `"."`,
 * joined with a space — `["A", "B"]` → `"A. B."` (`clarify-options.md` §"Nhiều câu hỏi").
 * Only used when there is more than one question; a single question sends its pick
 * verbatim, with no added punctuation.
 */
export function joinClarifyAnswers(answers: readonly string[]): string {
  return `${answers.join(". ")}.`;
}

export type UiPayload = ChartUi | TransferFormUi | JarUi | ClarifyOptionsUi | { type: string } | null;

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
 * `create_jar` shape: `jar_name`, `allocation_amount > 0` (the limit),
 * `initial_balance` (REQUIRED whole VND ≥ 0 — missing, negative or fractional is
 * rejected, never defaulted to 0), `category_ids` (may be `[]`), `reason`; a
 * `jar_id` is NOT allowed (`pfm` mints the id). Shape only — the balance vs "Chưa
 * phân bổ", duplicate names and category ownership are re-checked by the card
 * against live data. Never throws; a bad payload just falls back to `answer`.
 */
export function isCreateJarUi(ui: UiPayload | null | undefined, expenseIds?: ReadonlySet<string>): ui is CreateJarUi {
  if (!ui || ui.type !== "create_jar") return false;
  const f = ui as Partial<CreateJarUi> & { jar_id?: unknown };
  return (
    f.jar_id === undefined &&
    nonEmpty(f.jar_name) &&
    positive(f.allocation_amount) &&
    isJarAmount(f.initial_balance) && // whole VND ≥ 0, same bound the server applies
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
 * A non-empty list of `{to_jar_id, amount}` — each jar once, never `"pool"`, each
 * amount a positive whole number of VND, and no jar in `excluded`. Shape only:
 * whether the jars exist and the amounts fit is checked by the cards against live data.
 */
function validAllocations(list: unknown, excluded?: string): list is JarAllocation[] {
  if (!Array.isArray(list) || list.length === 0) return false;
  const seen = new Set<string>();
  for (const a of list as Partial<JarAllocation>[]) {
    if (!a || !nonEmpty(a.to_jar_id) || a.to_jar_id === "pool" || a.to_jar_id === excluded) return false;
    if (!positive(a.amount) || !Number.isInteger(a.amount) || seen.has(a.to_jar_id)) return false;
    seen.add(a.to_jar_id);
  }
  return true;
}

/**
 * `rebalance_jars` shape (contract 2026-09-24): `from_jar_id` (not `"pool"`),
 * `allocations` (each receiving jar once, none equal to the source, whole VND > 0)
 * and a `reason`. Caps against real balances are checked by `AgentRebalanceCard`
 * (it needs the jar snapshot). The old `{target_jar_id, shortfall, moves}` payload
 * fails here and falls back to `answer`.
 */
export function isRebalanceJarsUi(ui: UiPayload | null | undefined): ui is RebalanceJarsUi {
  if (!ui || ui.type !== "rebalance_jars") return false;
  const f = ui as Partial<RebalanceJarsUi>;
  return nonEmpty(f.from_jar_id) && f.from_jar_id !== "pool" && validAllocations(f.allocations, f.from_jar_id) && nonEmpty(f.reason);
}

/** `distribute_amount` shape: `allocations` (each jar once, never `"pool"`, whole VND > 0) and a `reason`. */
export function isDistributeAmountUi(ui: UiPayload | null | undefined): ui is DistributeAmountUi {
  if (!ui || ui.type !== "distribute_amount") return false;
  const f = ui as Partial<DistributeAmountUi>;
  return validAllocations(f.allocations) && nonEmpty(f.reason);
}

/** Any of the four jar proposals (create / edit / rebalance / distribute). */
export function isJarUi(ui: UiPayload | null | undefined, expenseIds?: ReadonlySet<string>): ui is JarUi {
  return isCreateJarUi(ui, expenseIds) || isEditJarUi(ui, expenseIds) || isRebalanceJarsUi(ui) || isDistributeAmountUi(ui);
}

/**
 * True only for a `ui.type === "clarify_options"` payload with 2–4 options, each
 * with a non-empty `id` and `label`, neither repeated within the block (contract
 * "Schema của `ui`"). Same reliability posture as the other guards: never throws;
 * a malformed payload just falls back to showing `answer` alone. Unlike
 * `isTransferFormUi`/`isJarUi`, there is nothing here to check against live data —
 * the doc is explicit that `label` is the agent's own read of the numbers, not a
 * server-verified figure.
 */
export function isClarifyOptionsUi(ui: UiPayload | null | undefined): ui is ClarifyOptionsUi {
  if (!ui || ui.type !== "clarify_options") return false;
  const f = ui as Partial<ClarifyOptionsUi>;
  if (!Array.isArray(f.questions) || f.questions.length < 1 || f.questions.length > 4) return false;
  return f.questions.every((q) => {
    if (!q || !nonEmpty(q.question)) return false;
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return false;
    if (!q.options.every(nonEmpty)) return false;
    return new Set(q.options).size === q.options.length;
  });
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
 * Ask the agent how to split an unallocated amount across jars
 * (`POST /jar-distribute`, no chat thread). `ui` is `distribute_amount` or `null`
 * (nothing to propose; `answer` says why). Takes 10–25 s — callers show a waiting state.
 */
export async function requestJarDistribute(input: { cif: string; amount: number; jarIds?: string[] }): Promise<ChatResponse> {
  const res = await fetch("/api/agent/jar-distribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: input.cif, amount: input.amount, ...(input.jarIds ? { jar_ids: input.jarIds } : {}) }),
  });
  return readJsonOrThrow(res) as Promise<ChatResponse>;
}

/**
 * Ask the agent how a jar's balance should move to other jars
 * (`POST /jar-rebalance`, no chat thread). `toJarIds` limits the receivers.
 * `ui` is `rebalance_jars` or `null`. Takes 10–25 s.
 */
export async function requestJarRebalance(input: {
  cif: string;
  fromJarId: string;
  amount: number;
  toJarIds?: string[];
}): Promise<ChatResponse> {
  const res = await fetch("/api/agent/jar-rebalance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.cif,
      from_jar_id: input.fromJarId,
      amount: input.amount,
      ...(input.toJarIds ? { to_jar_ids: input.toJarIds } : {}),
    }),
  });
  return readJsonOrThrow(res) as Promise<ChatResponse>;
}
