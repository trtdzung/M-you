// "Dựng" for one scenario card: wipe this persona's engine, write the events
// the rule needs, pin the clock, and read the signals back. The fraud agent
// stays off so the screen shows the spec wording.

import type { StoredTransferDraft } from "@/lib/transfer-draft-store";
import { useSecurityStore } from "@/state/security/store";
import type { SecurityState } from "@/state/security/types";
import { resetTestState } from "./actions";
import {
  CHAIN_RECIPIENT, DAY_MS, EMPLOYER, STRANGER, creditAccount, creditBurst, getClock, loadAccounts,
  pickAccount, postEvent, putClock, recordChain, setAccountOpened, settleFd, type AccountLite,
} from "./sim";
import { SCENARIO_CARDS, type ScenarioField } from "./scenarios";
import { stageTransfer } from "./stage-draft";

export type SignalProbe = { code: string; evidence: string };
export type BuiltCard = {
  fields: ScenarioField[];
  href: string;
  draft?: StoredTransferDraft;
  signals: SignalProbe[];
  note: string;
};

type Payee = { name: string; account: string; bank: string };
type Review = { amount: number; recipientName: string; recipientAccount: string; recipientBank?: string; memo?: string | null; sourceAccountId?: string | null };

const OTHER: Payee = { name: "LE VAN KHAC", account: "9704777700004321", bank: "ACB" };
const WARNED: Payee = { name: "TK CANH BAO", account: "9704000000000001", bank: "VietinBank" };
const SPOOF: Payee = { name: "NGUYEN THU HA", account: "0100005678", bank: "MSB" };
const HOLD_PAYEE: Payee = { name: "NGUYEN VAN MOI", account: "9704666600007777", bank: "ACB" };

const copy = (label: string, value: string): ScenarioField => ({ label, value, copy: value });
const money = (amount: number): ScenarioField => ({ label: "Số tiền", value: amount.toLocaleString("vi-VN"), copy: String(amount) });

function payeeFields(payee: Payee, amount: number, memo: string, extra: ScenarioField[] = []): ScenarioField[] {
  return [copy("Người nhận", payee.name), copy("Số tài khoản", payee.account), copy("Ngân hàng", payee.bank), money(amount), copy("Nội dung", memo), ...extra];
}

function unusualAmount(balance: number): number {
  return Math.max(15_000_000, Math.floor(balance * 0.5) + 1_000);
}

function profileOf(): SecurityState {
  const state = useSecurityStore.getState();
  return {
    aiProtect: state.aiProtect, familyAlerts: state.familyAlerts, securityTips: state.securityTips,
    antiPhishingCode: state.antiPhishingCode, emergencyContacts: state.emergencyContacts, trustedContacts: state.trustedContacts,
    transferLockUntil: state.transferLockUntil, holdEnabled: state.holdEnabled, holdThreshold: state.holdThreshold,
    cardsLocked: state.cardsLocked, accountLocked: state.accountLocked, accountLockedAt: state.accountLockedAt,
    pendingOff: state.pendingOff, alertLog: state.alertLog,
  };
}

async function pushProfile(cif: string): Promise<void> {
  const res = await fetch("/api/security/profile", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, state: profileOf() }),
  });
  if (!res.ok) throw new Error("Không lưu được hồ sơ.");
}

/** Reset wipes contacts. DH5, SC1 and a hold only notify someone who is active. */
async function ensureSimFamily(cif: string): Promise<void> {
  const active = useSecurityStore.getState().emergencyContacts.some(contact => contact.status === "active" || contact.status === "removing");
  if (!active) {
    useSecurityStore.setState({
      emergencyContacts: [{ id: "sim-family-1", name: "Nguyễn Thị Lan", relation: "Mẹ", phone: "0900000001", status: "active" }],
    });
  }
  await pushProfile(cif);
}

async function begin(cif: string): Promise<{ current: AccountLite; savings: AccountLite | null }> {
  const off = await fetch("/api/security/fraud-agent", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }),
  });
  if (!off.ok) throw new Error("Không tắt được Fraud agent.");
  await resetTestState();
  await pushProfile(cif);
  const accounts = await loadAccounts(cif);
  const current = pickAccount(accounts, "current");
  if (!current) throw new Error("Không có tài khoản thanh toán.");
  const savings = accounts.filter(account => account.type === "savings").sort((a, b) => b.balance - a.balance)[0] ?? null;
  return { current, savings };
}

async function pinHour(cif: string, hour: number): Promise<void> {
  await putClock(cif, { alertHour: hour });
}

async function probe(cif: string, review?: Review): Promise<SignalProbe[]> {
  const res = await fetch("/api/security/preview", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review ? { cif, review } : { cif, incoming: true }),
  });
  if (!res.ok) throw new Error("Không đọc được tín hiệu.");
  return ((await res.json()) as { signals: SignalProbe[] }).signals;
}

function verdict(signals: SignalProbe[], required: string[]): string {
  const missing = required.filter(code => !signals.some(signal => signal.code === code));
  if (!required.length) return "";
  return missing.length ? `Thiếu ${missing.join(", ")}` : "Đủ tín hiệu cho thẻ này";
}

function openTransfer(id: string, review: Review, source: AccountLite): { href: string; draft: StoredTransferDraft } {
  const draftId = `shield-${id}-${Date.now()}`;
  const draft: StoredTransferDraft = {
    id: draftId, name: review.recipientName, accountMasked: `••• ${review.recipientAccount.slice(-4)}`,
    accountNumber: review.recipientAccount, recipientBankName: review.recipientBank, amount: review.amount,
    memo: review.memo ?? null, sourceLabel: "Tài khoản thanh toán", sourceAccountId: source.id, sourceKind: "account",
    recipientSource: "user_typed",
  };
  return { href: `/transfer-confirm?draftId=${encodeURIComponent(draftId)}`, draft };
}

function reviewOf(payee: Payee, amount: number, memo: string, sourceId: string): Review {
  return { amount, recipientName: payee.name, recipientAccount: payee.account, recipientBank: payee.bank, memo, sourceAccountId: sourceId };
}

async function openCase(cif: string): Promise<void> {
  const res = await fetch("/api/security/cases", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, action: "open" }),
  });
  if (!res.ok) throw new Error("Không mở được hồ sơ.");
}

/** Reset, write what this card needs, and read the engine signals. */
export async function buildScenario(id: string, cif: string, calmDemo: () => void): Promise<BuiltCard> {
  const card = SCENARIO_CARDS.find(item => item.id === id);
  if (!card) throw new Error("Không có thẻ này.");
  const { current, savings } = await begin(cif);
  const large = unusualAmount(current.balance);
  const done = async (fields: ScenarioField[], href: string, signals: SignalProbe[], note: string, draft?: StoredTransferDraft, review?: Review): Promise<BuiltCard> => {
    if (review) await stageTransfer(cif, review);
    const mark = verdict(signals, card.signals);
    return { fields, href, draft, signals, note: [note, mark].filter(Boolean).join(" · ") };
  };

  if (id === "BT1") {
    await setAccountOpened(cif, 3);
    await postEvent(cif, "app_open");
    const clock = await getClock(cif);
    const age = clock.accountOpenedAt == null ? null : Math.floor((clock.now - clock.accountOpenedAt) / DAY_MS);
    return done([copy("Ngày mở tài khoản", age == null ? "chưa đặt" : `${age} ngày trước`)], "/", [], age != null && age <= 7 ? "Trong 7 ngày đầu" : "Chưa trong 7 ngày đầu");
  }
  if (id === "BT2") {
    calmDemo();
    return done([copy("Điểm", "Đã tắt mật khẩu, xác thực nâng cao và Face ID giả lập")], "/settings/security", [], "Mở Hub để engine hỏi điểm");
  }
  if (id === "BT3") {
    await creditAccount(cif, current.id, 120_000_000, EMPLOYER, "salary");
    return done([money(120_000_000), copy("Loại", "Lương"), copy("Người gửi", EMPLOYER.name)], "/", [], "Đã ghi lương, chưa có người thân");
  }
  if (id === "BT4") {
    await creditBurst(cif, current.id);
    return done([copy("Tiền vào", "3 × 50.000"), copy("Người gửi", STRANGER.name)], "/transactions", await probe(cif), "Tooltip trên giao dịch nhận tiền");
  }
  if (id === "BT5") {
    await creditAccount(cif, current.id, 30_000_000, STRANGER, "transfer");
    return done([money(30_000_000), copy("Người gửi", STRANGER.name), copy("Số tài khoản", STRANGER.account)], "/transactions", await probe(cif), "Tooltip trên giao dịch nhận tiền");
  }
  if (id === "BT6") {
    await recordChain(cif, current.id, 1, CHAIN_RECIPIENT);
    const review = reviewOf(CHAIN_RECIPIENT, 200_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done([...payeeFields(CHAIN_RECIPIENT, 200_000, "tien hang"), copy("Trên màn", "Bấm Xác nhận")], opened.href, [], "Đã ghi 1 lệnh trong 5 phút", opened.draft, review);
  }
  if (id === "BT7") {
    return done(card.fields, card.href, [], "Dán tin mẫu rồi bấm Kiểm tra");
  }
  if (id === "DH3-2") {
    await pinHour(cif, 10);
    await recordChain(cif, current.id, 1, CHAIN_RECIPIENT);
    const review = reviewOf(CHAIN_RECIPIENT, 200_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done(payeeFields(CHAIN_RECIPIENT, 200_000, "tien hang"), opened.href, await probe(cif, review), "Lệnh thứ 2", opened.draft, review);
  }
  if (id === "DH1") {
    await pinHour(cif, 10);
    const review = reviewOf(SPOOF, 500_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done(payeeFields(SPOOF, 500_000, "tien hang"), opened.href, await probe(cif, review), "Tên quen, số khác", opened.draft, review);
  }
  if (id === "DH2" || id === "DH8-night" || id === "DH8-words" || id === "DH8-screen" || id === "DH-T5") {
    const hour = id === "DH8-night" ? 23 : 10;
    const memo = id === "DH8-words" ? "nop thue" : "tien hang";
    await pinHour(cif, hour);
    if (id === "DH8-screen") await postEvent(cif, "screen_share_on", { app: "Zoom" });
    if (id === "DH-T5") await postEvent(cif, "password_changed");
    const review = reviewOf(STRANGER, large, memo, current.id);
    const opened = openTransfer(id, review, current);
    const extra = id === "DH8-night" ? [copy("Giờ chấm", "23:00")] : id === "DH8-screen" ? [copy("Màn hình", "Đang chia sẻ")] : [];
    return done(payeeFields(STRANGER, large, memo, extra), opened.href, await probe(cif, review), id === "DH-T5" ? "Đã ghi đổi mật khẩu" : "Giờ chấm đã ghim", opened.draft, review);
  }
  if (id === "DH3") {
    await pinHour(cif, 10);
    await recordChain(cif, current.id, 2, CHAIN_RECIPIENT);
    const review = reviewOf(CHAIN_RECIPIENT, 500_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done(payeeFields(CHAIN_RECIPIENT, 500_000, "tien hang"), opened.href, await probe(cif, review), "Lệnh thứ 3", opened.draft, review);
  }
  if (id === "DH4") {
    await pinHour(cif, 10);
    const review = reviewOf(WARNED, 500_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done(payeeFields(WARNED, 500_000, "tien hang"), opened.href, await probe(cif, review), "Số trong danh sách mock", opened.draft, review);
  }
  if (id === "DH5") {
    if (!savings || savings.balance <= 0) throw new Error("Persona không có sổ tiết kiệm.");
    const settled = Math.min(savings.balance, Math.floor(savings.balance * 0.5) + 1_000);
    await pinHour(cif, 10);
    await ensureSimFamily(cif);
    await settleFd(cif, savings.id, settled);
    const review = reviewOf(STRANGER, 2_000_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done([...payeeFields(STRANGER, 2_000_000, "tien hang"), { label: "Sổ đã tất toán", value: settled.toLocaleString("vi-VN"), copy: String(settled) }], opened.href, await probe(cif, review), "Đã tất toán sổ và thêm người thân giả lập", opened.draft, review);
  }
  if (id === "DH6") {
    await pinHour(cif, 10);
    await creditBurst(cif, current.id);
    await recordChain(cif, current.id, 2, CHAIN_RECIPIENT);
    const review = reviewOf(CHAIN_RECIPIENT, 500_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done(payeeFields(CHAIN_RECIPIENT, 500_000, "tien hang"), opened.href, await probe(cif, review), "3 khoản mồi và 2 lệnh trước", opened.draft, review);
  }
  if (id === "DH7") {
    await pinHour(cif, 10);
    await creditAccount(cif, current.id, 30_000_000, STRANGER, "transfer");
    const review = reviewOf(OTHER, 24_000_000, "chuyen tra", current.id);
    const opened = openTransfer(id, review, current);
    return done(payeeFields(OTHER, 24_000_000, "chuyen tra"), opened.href, await probe(cif, review), "24 triệu là 80% khoản 30 triệu", opened.draft, review);
  }
  if (id === "SC1") {
    await ensureSimFamily(cif);
    return done(card.fields, card.href, [], "Đã thêm người thân giả lập");
  }
  if (id === "SC2") {
    await openCase(cif);
    return done(card.fields, card.href, [], "Đã mở hồ sơ");
  }
  if (id === "SC3") {
    await openCase(cif);
    return done(card.fields, "/", [], "Banner trên Home trong 30 ngày");
  }
  if (id === "SC4") {
    await postEvent(cif, "account_locked");
    return done(card.fields, "/settings/security", [], "Đã ghi khóa tài khoản");
  }
  if (id === "HOLD") {
    useSecurityStore.getState().setHold(true);
    useSecurityStore.getState().lowerHoldThreshold(100_000);
    await ensureSimFamily(cif);
    await pinHour(cif, 10);
    const review = reviewOf(HOLD_PAYEE, 200_000, "tien hang", current.id);
    const opened = openTransfer(id, review, current);
    return done([...payeeFields(HOLD_PAYEE, 200_000, "tien hang"), copy("Ngưỡng", "100.000"), copy("Trên màn", "Bấm Xác nhận")], opened.href, await probe(cif, review), "Giữ lệnh đang bật, đã thêm người thân giả lập", opened.draft, review);
  }
  throw new Error("Không có thẻ này.");
}
