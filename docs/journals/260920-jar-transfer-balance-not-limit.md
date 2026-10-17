# 2026-09-20 — Tách SỐ DƯ khỏi HẠN MỨC khi chuyển tiền giữa hũ (plan `260920-1317-jar-transfer-balance-not-limit`)

## Vấn đề

`dieu-chinh-hu` (chuyển tiền giữa hũ, `rebalance` meta trên một txn `self_reported`)
đang kéo theo **cả hạn mức**, không chỉ số dư. `jar-budget.ts` tính một biến trung
gian `effectiveLimit = limit + rebalanceNet` rồi đo `status`/`pct` theo đó — nghĩa
là chuyển 1tr từ hũ Ăn uống (hạn mức 5tr, chưa tiêu) sang hũ Đi lại (hạn mức 2tr,
đã tiêu 2tr) không chỉ bù số dư (đúng) mà còn âm thầm nâng hạn mức Đi lại lên 3tr,
làm badge "Đã vượt" và cảnh báo ngân sách biến mất — trong khi thực tế người dùng
vẫn đã chi vượt kế hoạch 2tr mà họ tự đặt ra.

## Quyết định sản phẩm (người dùng chốt)

Hai trục độc lập, không con nào ghi đè con nào:

| Trục | Công thức | Ý nghĩa |
|---|---|---|
| **SỐ DƯ** (`remaining`) | `limit − spent + (Σ nhận − Σ cho)` | còn bao nhiêu tiền tiêu được; `< 0` → "cần bù thủ công" |
| **HẠN MỨC** (`limit`, `pct`, `status`, `overLimit`) | `pct = spent/limit`, `over ⇔ spent > limit` | kế hoạch chi có bị vượt không; KHÔNG BAO GIỜ đổi vì một lệnh chuyển tiền |

Hệ quả: một hũ đã được bù về số dư ≥ 0 **vẫn** báo "vượt hạn mức" nếu `spent > limit`
— badge "Đã vượt" và "Đã bù" hiện **đồng thời**, không loại trừ nhau.

## Thay đổi

- **Engine.** `src/domain/engine/jar-budget.ts`: xoá hẳn field `JarBudgetLine.effectiveLimit`.
  `jarStatus(spent, limit)`/`jarPct(spent, limit)` giờ nhận thẳng `limit` gốc thay vì
  ceiling đã cộng `rebalanceNet`. `remaining` giữ nguyên giá trị cũ, tính thẳng
  `limit − spent + rebalanceNet` (không qua biến trung gian). `src/domain/engine/jar-envelope.ts`:
  `JarEnvelopeLine.overLimit` đổi từ `remaining < 0` sang `spent > budgetLimit` — khớp
  đúng JSDoc vốn đã mô tả sai với code trước đó.
- **UI.** `src/components/budget/HuBudgetCard.tsx`: hiện hạn mức GỐC (không phải
  effective), thêm nhãn `%` ở `rightLabel` của `PressureRow`, badge "Đã vượt {số tiền}"
  không còn bị điều kiện `!covered` che đi. `src/components/budget/JarBalanceRow.tsx`
  (file mới, thuần trình bày): dòng "Số dư" + ghi chú "Đã nhận X từ hũ khác" /
  "Đã chuyển X sang hũ khác" tuỳ dấu `rebalanceNet`, render riêng khỏi thanh
  đã-tiêu/hạn-mức phía trên.
- **Insight.** `src/insights/detectors/jar-pressure.ts`: hũ có `status: "over"` nhưng
  số dư đã được bù đủ (`remaining >= 0`) bị **loại khỏi danh sách `over`** — không bắn
  `jar_pressure` nữa. `jarOverspendCovered` là detector duy nhất kể chuyện hũ được bù,
  nên người dùng không thấy hai card nói cùng một việc (H3). Bản nháp đầu chỉ hạ
  `severity` xuống `"attention"`, nhưng code review chỉ ra cả hai detector vẫn cùng
  bắn cho một hũ — đó mới là double-warn thật. Hũ còn thiếu tiền thật sự
  (`remaining < 0`) vẫn `urgent` như cũ.
- **Test sweep.** Viết lại kỳ vọng theo hành vi mới ở `jar-budget.test.ts`,
  `jar-budget-guards.test.ts` (describe mới "hai trục: rebalance đổi SỐ DƯ, không đổi
  verdict hạn mức", gồm sweep leg `[0, 10k, 49_999, 50k, 50_001, 200k]` xác nhận
  `status` không đổi bất kể mức bù), `jar-envelope.test.ts`, `finance-compose.test.ts`
  (case S2 pool-cover: verdict lật sang `"over"`/`overLimit: true`, đẳng thức
  `pool + Σ spendable = CASA` giữ nguyên), `budget-tab.test.tsx` (badge "Đã vượt" +
  "Đã bù" cùng hiện), `jar-pressure.test.ts` (case covered → `null`, case còn thiếu
  tiền → `urgent`, case hũ đã bù không che mất hũ `near` khác), `detectors.test.ts`
  (test H3 chạy cả `runDetectors`: một hũ được bù sinh ĐÚNG MỘT insight). Xoá field
  `effectiveLimit` cơ học khỏi các factory literal ở `insights/__tests__/helpers.ts`
  và `lib/__tests__/auto-fund-core.test.ts`; đồng thời `makeJarBudgetLine` giờ suy ra
  `remaining` mặc định theo đúng công thức engine (`limit − spent + rebalanceNet`) để
  fixture không dựng được trạng thái engine không bao giờ tạo ra.

## Không đổi (giữ nguyên bất biến)

- Schema DB, các endpoint `/api/jars*` — `budget_limit` chỉ bị sửa bởi `AllocationSheet`
  ("Chia ngay") hoặc `HuEditorSheet` (Cài đặt), không bao giờ bởi một lệnh chuyển tiền.
- `jarSpendable(remaining) = max(0, remaining)`, đẳng thức `pool + Σ spendable = CASA`.
- Vòng đời rebalance theo kỳ: `rebalanceNetByJar` vẫn lọc `inPeriod`. **Số dư KHÔNG
  tích luỹ qua tháng** — đầu kỳ sau, `remaining` của mọi hũ quay về đúng `budget_limit`
  vì cửa sổ tính rebalance của kỳ trước đã đóng. Đây là giới hạn đã biết, chấp nhận,
  không phải bug.
- Luồng auto-fund/chuyển tiền thật (`useAutoFund`, `TransferConfirm`) không đọc `status`,
  chỉ đọc `remaining`/`spendable` — nên hành vi rót tiền tự động không đổi.

## Kiểm chứng

`npx vitest run`: 1120 pass / 0 fail. `npx tsc --noEmit`: 0 lỗi. `npx next lint`:
0 error / 0 warning. `npm run build`: compile sạch. Không còn chuỗi
`effectiveLimit` trong `src/` (`grep -r effectiveLimit src/` → rỗng).

## Việc chưa làm / theo dõi tiếp

- `thresholdHit` (ngưỡng 80%) giờ đo theo `limit` gốc, nên một hũ đã được bù đủ tiền
  vẫn có thể `thresholdHit: true` nếu `spent ≥ 80% limit` — chấp nhận, đúng trục kế hoạch.
- `jar-budget.ts` và `jar-envelope.ts` vẫn là hai engine song song (M7, ngoài phạm vi
  đợt này) — cả hai đã áp dụng cùng công thức hai trục nên không lệch nhau, nhưng chưa
  hợp nhất.
