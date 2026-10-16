# Hũ làm nguồn chuyển tiền (Phần 1) — design

Status: approved, implemented.

## Bổ sung sau khi verify (đã áp dụng)

Verify thật cho thấy màn "Ngân sách" (PFM) không đổi sau khi chuyển từ hũ —
đúng như phần "Không phải mục tiêu" bên dưới đã ghi (Ngân sách tính từ lịch
sử giao dịch thật qua engine, không biết gì về `actualAmount`). Người dùng
xác nhận muốn 2 khái niệm này khớp nhau ("Ngân sách chính là hũ đó"), nên đã
bổ sung: khi xác nhận chuyển tiền có nguồn là hũ, NGOÀI việc trừ `actualAmount`
+ trừ tài khoản, còn **ghi thêm 1 giao dịch self-reported** (tái dùng thẳng
`useManualTxns()` — cơ chế nút ＋ "Thêm giao dịch" đã có sẵn, không phải cơ
chế mới) vào danh mục ĐẦU TIÊN trong `categoryIds` của hũ đó. Nhờ vậy
`evaluateJarBudget` (Ngân sách) tự động thấy đúng số đã tiêu qua
`netExpenseByCategory` — không cần sửa gì trong engine. Không áp dụng khi
nguồn là tài khoản (giữ nguyên hành vi cũ).

## Context

Hũ chi tiêu ("Jar") hiện là một công cụ ngân sách thuần tuý:
`Jar { id, label, categoryIds, budgetLimit?, color?, icon? }`, và "còn lại"
(`remaining`) được engine tính động mỗi lần từ `budgetLimit` trừ chi tiêu
thật trong các danh mục của hũ đó — không có số dư nào được lưu trữ.

Trong màn Chuyển tiền, hũ hiện chỉ xuất hiện ở sheet "Chọn tài khoản nguồn"
dưới dạng xem-nhanh, không bấm được (quyết định đã chốt ở phiên trước: "hũ
không phải tài khoản ngân hàng thật").

Yêu cầu mới (đảo ngược một phần quyết định đó, đã xác nhận trực tiếp với
người dùng): mỗi hũ cần có **"Số tiền đã set"** và **"Số tiền thực tế"**, và
khi chuyển khoản với nguồn là 1 hũ, số tiền thực tế đó phải bị trừ thật.

**Phạm vi phần 1 (đã chốt):** chỉ việc chọn hũ làm "Tài khoản nguồn" trong
màn Chuyển tiền hiện có, khi chuyển tiền RA NGOÀI (cho người khác). Việc
nạp/rút tiền GIỮA các hũ (hoặc từ tài khoản chính vào hũ) là phần 2, xử lý ở
màn quản lý hũ sau này — KHÔNG nằm trong phạm vi lần này.

## Mục tiêu / Không phải mục tiêu

**Mục tiêu:**
- Hũ có 2 con số: đã set (= `budgetLimit` hiện có) và thực tế (`actualAmount`
  mới).
- Chọn hũ làm nguồn trong Chuyển tiền, giới hạn số tiền theo `actualAmount`.
- Xác nhận thành công → trừ thật vào hũ VÀ vào tài khoản thanh toán đang giữ
  hũ đó (tiền trong hũ vốn là một phần tiền trong tài khoản đó, không phải
  tiền riêng).

**Không phải mục tiêu (phần 2, làm sau):**
- Nạp tiền vào hũ / chuyển tiền giữa các hũ.
- Sửa màn quản lý hũ (Cài đặt hũ / `HuEditorSheet`) hay màn PFM Ngân sách.
- Chuyển tiền với nguồn là tài khoản (không qua hũ) — hành vi giữ nguyên
  y hệt hiện tại (không trừ số dư hiển thị ở đâu cả, đúng như toàn app từ
  trước đến giờ).

## Data model

Thêm 1 field optional vào `Jar` (`src/domain/models/index.ts`):

```ts
export interface Jar {
  id: string;
  label: string;
  categoryIds: string[];
  budgetLimit?: number;
  /** Số tiền thực tế còn lại, dùng để chọn hũ làm nguồn chuyển tiền (Chuyển
   *  tiền Phần 1). `undefined` = chưa có số dư thật (hũ chưa có budgetLimit,
   *  hoặc chưa từng "nạp" — invariant #6, không tự ý gán 0). */
  actualAmount?: number;
  color?: string;
  icon?: string;
}
```

Không đổi `version` của `JarConfig` (vẫn `3`) — field mới optional, một
config cũ thiếu field này vẫn hợp lệ (`actualAmount: undefined`).

**Seed/backfill khi tải:** trong `migrateJarConfig`
(`src/state/jars.tsx`), thêm một bước `backfillActualAmount` chạy TRƯỚC
`dedupeCategories`/`healOrphanCategories`: với mỗi hũ có `budgetLimit !==
undefined` và `actualAmount === undefined`, gán `actualAmount =
budgetLimit`. Hũ không có `budgetLimit` (không áp dụng cho dữ liệu người
dùng hiện tại, nhưng vẫn cần xử lý an toàn cho template "Cá nhân" có hũ
"Tiết kiệm" không set hạn mức) giữ nguyên `actualAmount: undefined` — hũ đó
CHƯA chọn được làm nguồn cho tới khi có tính năng nạp tiền (phần 2).

Đây là tính toán khi-tải (giống `healOrphanCategories`), không ép ghi lại
localStorage ngay — sẽ tự lưu đúng vào lần mutate tiếp theo (giữ đúng pattern
hiện có).

`isValidJar` (`src/providers/mock/mock-provider.ts`) thêm guard cho
`actualAmount` giống hệt cách `budgetLimit` đang được validate (finite,
không âm, hoặc undefined).

## Mutator mới: `spendFromJar`

`JarConfigContextValue` (`src/state/jars.tsx`) thêm:

```ts
spendFromJar: (id: string, amount: number) => void;
```

Cài đặt qua `mutate()` sẵn có (pure transform + tự persist, giống
`updateJar`): tìm hũ theo `id`, trừ `amount` khỏi `actualAmount` hiện tại
(no-op nếu hũ không tồn tại hoặc `actualAmount` đang `undefined` — validation
"đủ tiền" đã chặn ở UI trước khi tới bước này, đây chỉ là lớp phòng thủ).

## Cơ chế điều chỉnh số dư tài khoản

`Account.balance` do engine tính từ lịch sử giao dịch cố định — không được
sửa trực tiếp (nguyên tắc #1). Thêm 1 lớp điều chỉnh riêng, CHỈ áp dụng khi
nguồn là hũ:

**2 method mới trên `Providers`** (`src/providers/interfaces.ts`), cạnh
`getJarConfig`/`saveJarConfig`:

```ts
/** Tổng đã trừ khỏi mỗi tài khoản qua 1 lần chuyển-từ-hũ (mock ledger đè lên
 *  balance engine tính — Account.balance tự nó không đổi). */
getAccountAdjustments(): Promise<Record<string, number>>;
/** Cộng dồn 1 khoản trừ vào tài khoản (không phải ghi đè). */
applyAccountDebit(accountId: string, amount: number): Promise<void>;
```

Cài đặt trong `mock-provider.ts` bằng `personaLocalStorageResource` (helper
dùng chung sẵn có cho assets/liabilities/goals), namespace
`"account-adjustments"`, seed `{}`, guard: object có mọi value là số hữu hạn
không âm.

**1 hàm thuần dùng chung** `applyAccountAdjustments(accounts, adjustments)`
(vị trí đề xuất: `src/lib/account-adjustments.ts`) — map mỗi account trừ đi
`adjustments[account.id] ?? 0`.

**Không cần Context/Provider mới.** `useFinancials` và `TransferCompose` mỗi
nơi đã tự fetch dữ liệu account riêng (`Promise.all` sẵn có) theo vòng đời
mount-của-route — chỉ cần thêm `providers.getAccountAdjustments()` vào cùng
`Promise.all` đó rồi áp `applyAccountAdjustments` lên kết quả trước khi lưu
state. Vì mỗi màn hình là 1 route riêng (remount khi điều hướng), số dư mới
tự động đúng ngay khi người dùng quay lại Trang chủ/Tài khoản sau khi chuyển
từ hũ — không cần đồng bộ realtime qua Context.

- `useFinancials.ts`: thêm `getAccountAdjustments()` vào `Promise.all`, áp
  dụng lên `accounts` TRƯỚC khi `setRaw(...)` — mọi màn hình đọc qua
  `useFinancials` tự động thấy số dư đã trừ (Trang chủ, Tài khoản, v.v.).
- `TransferCompose.tsx`: áp dụng y hệt lên kết quả `providers.listAccounts()`
  của chính nó (vì nó gọi thẳng provider, không qua `useFinancials`) — để
  sheet "Chọn tài khoản nguồn" hiện đúng số dư mới nhất.

## Luồng UI

### `TransferAmountStep.tsx`

- Đổi `sourceAccountId: string` → 1 giá trị nguồn dạng
  `{ kind: "account" | "jar"; id: string } | null`, prop `onSourceChange`
  nhận giá trị này thay vì chỉ account id.
- Dòng hũ trong sheet: hũ có `actualAmount !== undefined` → đổi từ `<li>`
  sang `<button>` bấm được, hiện **"Đã set: {budgetLimit}"** và **"Thực tế:
  {actualAmount}"** (thay cho dòng "Còn lại" cũ — CHỈ ở sheet này, các nơi
  khác hiện `remaining` vẫn giữ nguyên, ngoài phạm vi). Hũ chưa có
  `actualAmount` giữ nguyên non-interactive + thêm chú thích "Chưa có số dư".
- Ô "Tài khoản nguồn" đã đóng: hiện tên hũ + "Thực tế: X" khi nguồn đang là
  hũ, thay vì số TK + số dư tài khoản.

### `TransferCompose.tsx`

- State nguồn: `const [source, setSource] = useState<{kind:"account"|"jar"; id:string}>({kind:"account", id:""})`.
- `canContinue`: nếu `source.kind === "jar"`, hợp lệ khi tìm thấy hũ, hũ có
  `actualAmount !== undefined`, và `numericAmount <= actualAmount`. Nếu
  `"account"`, giữ nguyên logic hiện có.
- `continueToConfirm()`: thêm `sourceJarId` vào `StoredTransferDraft` khi
  `source.kind === "jar"`; `sourceLabel` đổi thành `"Hũ {label}"`.

### `StoredTransferDraft` (`src/lib/transfer-draft-store.ts`)

Thêm `sourceJarId?: string`.

### `/transfer-confirm` (`TransferConfirm.tsx`)

`confirm()` thành `async`. Nếu `draft.sourceJarId` có giá trị:
1. `spendFromJar(draft.sourceJarId, draft.amount)` (qua `useJarConfig()`).
2. `await providers.listAccounts()`, tìm account `type === "current"`, gọi
   `providers.applyAccountDebit(account.id, draft.amount)`.

Nếu không có `sourceJarId` (nguồn là tài khoản, như hiện tại) — không làm gì
thêm, giữ nguyên hành vi cũ.

## Edge case đã tính tới

- Hũ không có `budgetLimit` (vd hũ "Tiết kiệm" trong template "Cá nhân"):
  `actualAmount` luôn `undefined`, không chọn được làm nguồn — không áp dụng
  cho dữ liệu người dùng hiện tại (không có hũ tiết kiệm) nhưng vẫn không vỡ
  nếu ai đó áp dụng lại template có hũ này.
- Nhập số tiền lớn hơn `actualAmount` của hũ đang chọn → "Tiếp tục" tự
  disable, giống hệt cơ chế disable hiện có (không thêm cơ chế báo lỗi mới).
- Chuyển tiền với tài khoản làm nguồn (không đổi) → không có `sourceJarId`
  trong draft → hành vi 100% như cũ, không trừ gì.

## Testing

Theo đúng chỉ đạo hiện hành ("không cần test cho đến khi được bảo"): không
viết test mới. Chỉ sửa tối thiểu test cũ nếu bị vỡ do đổi shape
`sourceAccountId` → `source`. Verify bằng `tsc`/lint sạch + thao tác thật qua
CDP (chọn hũ làm nguồn, chuyển tiền, xác nhận, quay lại Trang chủ kiểm tra số
dư tài khoản đã giảm và hũ đã giảm số tiền thực tế).
