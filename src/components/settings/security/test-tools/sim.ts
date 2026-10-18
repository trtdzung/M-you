// Client calls for the simulation panel and the quick-action sheet. Demo data only.

export const STRANGER = { name: "NGUYEN VAN LA", account: "9704999911110001", bank: "Vietcombank" };
export const KNOWN = { name: "Phạm Thu Hà", account: "0281000556677", bank: "Techcombank" };
export const EMPLOYER = { name: "CONG TY LUONG", account: "9704000011112222", bank: "MSB" };
export const CHAIN_RECIPIENT = { name: "Nguyen Van X", account: "9704888800001234", bank: "Vietcombank" };

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export type Sender = { name: string; account: string; bank: string };
export type IncomeKind = "salary" | "income" | "transfer";
export type AccountLite = { id: string; type: "current" | "savings" | "credit_card"; maskedNumber: string; balance: number };
export type ClockView = {
  offsetMs: number;
  alertHour: number | null;
  accountOpenedAt: number | null;
  skipHold: boolean;
  now: number;
  alertTime: number;
};
export type FrequencyMark = { id: string; scenario: string; at: number; key: string | null };
export type WarnedRow = { account: string; bank: string; level: "danger" | "suspicious"; source: "mock"; note: string };

const ENGINE_EVENT = "msb-engine-sim";

export function emitEngineChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ENGINE_EVENT));
}

export function onEngineChange(fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener(ENGINE_EVENT, handler);
  return () => window.removeEventListener(ENGINE_EVENT, handler);
}

async function ensure(res: Response, fallback: string): Promise<void> {
  if (!res.ok) throw new Error(fallback);
}

async function post(path: string, body: unknown, fallback: string): Promise<Response> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await ensure(res, fallback);
  return res;
}

export async function loadAccounts(cif: string): Promise<AccountLite[]> {
  const res = await fetch(`/api/accounts?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
  await ensure(res, "Không tải được tài khoản.");
  return res.json() as Promise<AccountLite[]>;
}

export function pickAccount(accounts: AccountLite[], type: AccountLite["type"]): AccountLite | null {
  return accounts.find(account => account.type === type) ?? null;
}

export async function creditAccount(cif: string, accountId: string, amount: number, sender: Sender, kind: IncomeKind, memo?: string): Promise<void> {
  await post("/api/accounts/credit", { cif, accountId, amount, sender, kind, ...(memo ? { memo } : {}) }, "Không ghi được tiền vào.");
  emitEngineChange();
}

export async function creditBurst(cif: string, accountId: string): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await post("/api/accounts/credit", {
      cif, accountId, amount: 50_000, sender: STRANGER, kind: "transfer", memo: "Chuyen khoan",
    }, "Không ghi được tiền vào.");
  }
  emitEngineChange();
}

export async function postEvent(cif: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
  await post("/api/security/events", { cif, type, payload }, "Không ghi được sự kiện.");
  emitEngineChange();
}

export async function settleFd(cif: string, accountId: string, amount: number): Promise<void> {
  await post("/api/security/fd-settle", { cif, accountId, amount }, "Không tất toán được sổ.");
  emitEngineChange();
}

export async function recordChain(cif: string, accountId: string, count: number, recipient: Sender = CHAIN_RECIPIENT): Promise<void> {
  await post("/api/security/chain", {
    cif, accountId, count, recipientName: recipient.name, recipientAccount: recipient.account, recipientBank: recipient.bank,
  }, "Không ghi được chuỗi lệnh.");
  emitEngineChange();
}

export async function getClock(cif: string): Promise<ClockView> {
  const res = await fetch(`/api/security/clock?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
  await ensure(res, "Không đọc được đồng hồ.");
  return res.json() as Promise<ClockView>;
}

export async function putClock(cif: string, patch: Partial<Pick<ClockView, "offsetMs" | "alertHour" | "accountOpenedAt" | "skipHold">>): Promise<ClockView> {
  const res = await fetch("/api/security/clock", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, ...patch }),
  });
  await ensure(res, "Không đặt được đồng hồ.");
  emitEngineChange();
  return res.json() as Promise<ClockView>;
}

export async function shiftClock(cif: string, deltaMs: number | null): Promise<ClockView> {
  if (deltaMs === null) return putClock(cif, { offsetMs: 0 });
  const clock = await getClock(cif);
  return putClock(cif, { offsetMs: clock.offsetMs + deltaMs });
}

export async function setAccountOpened(cif: string, daysAgo: number | null): Promise<ClockView> {
  if (daysAgo === null) return putClock(cif, { accountOpenedAt: null });
  const clock = await getClock(cif);
  return putClock(cif, { accountOpenedAt: clock.now - daysAgo * DAY_MS });
}

export async function screenShareOn(cif: string): Promise<boolean> {
  const res = await fetch(`/api/security/events?cif=${encodeURIComponent(cif)}&types=screen_share_on,screen_share_off`, { cache: "no-store" });
  await ensure(res, "Không đọc được sự kiện.");
  const events = (await res.json()) as { type: string }[];
  return events.at(-1)?.type === "screen_share_on";
}

export async function loadMarks(cif: string): Promise<FrequencyMark[]> {
  const res = await fetch(`/api/security/frequency?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
  await ensure(res, "Không đọc được tần suất.");
  return ((await res.json()) as { marks: FrequencyMark[] }).marks;
}

export async function deleteMark(cif: string, id: string | "all"): Promise<FrequencyMark[]> {
  const query = id === "all" ? `cif=${encodeURIComponent(cif)}&all=1` : `cif=${encodeURIComponent(cif)}&id=${encodeURIComponent(id)}`;
  const res = await fetch(`/api/security/frequency?${query}`, { method: "DELETE" });
  await ensure(res, "Không xóa được mốc.");
  emitEngineChange();
  return ((await res.json()) as { marks: FrequencyMark[] }).marks;
}

export async function loadWarned(): Promise<{ accounts: WarnedRow[]; disclaimer: string }> {
  const res = await fetch("/api/security/warned", { cache: "no-store" });
  await ensure(res, "Không đọc được danh sách cảnh báo.");
  return res.json() as Promise<{ accounts: WarnedRow[]; disclaimer: string }>;
}

export async function addWarned(input: { account: string; bank: string; level: WarnedRow["level"]; note: string }): Promise<WarnedRow[]> {
  const res = await post("/api/security/warned", input, "Không thêm được số cảnh báo.");
  emitEngineChange();
  return ((await res.json()) as { accounts: WarnedRow[] }).accounts;
}

export async function removeWarned(account: string, bank: string): Promise<WarnedRow[]> {
  const query = new URLSearchParams({ account, bank });
  const res = await fetch(`/api/security/warned?${query}`, { method: "DELETE" });
  await ensure(res, "Không xóa được số cảnh báo.");
  emitEngineChange();
  return ((await res.json()) as { accounts: WarnedRow[] }).accounts;
}
