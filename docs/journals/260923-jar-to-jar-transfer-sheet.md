# 2026-09-23 — Sheet chuyển số dư giữa các hũ từ Tổng quan (plan `260923-jar-to-jar-transfer-sheet`)

## Vấn đề

Muốn chuyển số dư giữa 2 hũ (hoặc hũ ↔ pool "Chưa phân bổ") phải sang tab Ngân sách. Tap thẻ hũ ở
Tổng quan chỉ điều hướng sang tab khác chứ không làm gì tại chỗ.

## Quyết định (xem plan.md → Validation Log)

- Tap thẻ hũ (tháng hiện tại) mở `JarTransferSheet` ngay tại Tổng quan thay vì điều hướng; tháng cũ
  card chỉ xem, không bấm được.
- Ghi 1 leg `dieu-chinh-hu` qua `useAutoFundWith(...).commitPersisted` — display partition CASA,
  không phải tiền thật, không OTP (invariant #3 an toàn).
- Server guard cho leg `dieu-chinh-hu`: tồn tại + `from ≠ to` áp cho **mọi** leg; cap CASA chỉ áp cho
  leg có `triggerTxnId` **không trỏ tới txn thật** (= user tự chia lại số dư qua sheet). Leg bù chi
  vượt do auto-fund/reconcile tạo ra (trigger là txn thật) không bị cap chặn nhầm.
- Amount: số nguyên dương VND bất kỳ (không bắt buộc bội số).

## Đã làm (4 phase)

01 tách rule thuần `jar-transfer-rules.ts` (validate amount, cap, from≠to, snapshot số dư có dấu cho
pool) trong `src/domain/engine/`, dùng chung cho cả UI mới và `AgentRebalanceCard` (bỏ code trùng) ·
04 server guard `rebalance-leg-guard.ts` — chặn jar không tồn tại (404), `from = to`, và cap chỉ khi
`triggerTxnId` không phải txn thật · 02 UI `JarTransferSheet` + `JarTransferEndpointRow` +
`JarTransferPicker` + `JarTransferAmountField`, nút ⇅ đảo chiều, nguồn mặc định = hũ được tap, ref
guard chống double-submit · 03 wire `HuOverviewRow` (tap mở sheet thay vì `onNavigate`), xoá plumbing
`onNavigate`/`selectTab` chết ở `PfmTabHost`, test mới cho picker/endpoint/double-submit/overLimit
không đổi sau chuyển.

## Bài học

- **Guard theo semantics của leg, không theo `origin`.** `origin: "manual"` được dùng chung bởi cả
  sheet mới lẫn luồng reconcile (`TransferCategorizeSection`, `UnlabeledSpendSheet`) nên không thể
  dùng `origin` để phân biệt. Tiêu chí đúng là `triggerTxnId` có trỏ tới txn thật hay không — đó mới
  là ranh giới "user tự điều chỉnh" vs "hệ thống bù trừ từ một giao dịch có thật".
- **PATCH amount-only là cửa hậu.** Code review (8/10) bắt được: sửa amount qua PATCH bỏ qua guard
  vừa thêm ở POST. Phải áp guard cho cả hai path rồi mới đóng review.
- **Test cũ bị vỡ vì guard mới nghiêm hơn giả định cũ.** `route.test.ts` trước đó dùng jar id/txn id
  giả lập; giờ guard 404 nếu jar không tồn tại nên phải seed jar thật + một trigger txn thật trước khi
  gọi API trong test.
- Rule thuần tách ra dùng lại được ngay cho `AgentRebalanceCard` — tránh viết lại validate cap/from≠to
  lần hai (DRY theo đúng chủ đích ban đầu của phase 01).

## Rủi ro chấp nhận

`cif` do client gửi, không xác thực phía server (pre-existing, toàn prototype, không xử lý riêng
theo YAGNI/POC). Cap server chỉ áp cho leg có trigger tự tạo — leg bù chi vượt từ txn thật không bị
chặn cap, chấp nhận vì ưu tiên không chặn nhầm auto-fund/reconcile hơn là chặn chặt tuyệt đối.

## Trạng thái

`npm run lint`, `npm run test` (1368 test xanh), `npm run build` đều pass. Code review 8/10, đã sửa
finding PATCH amount-only nêu trên và có test hồi quy riêng.

## Còn nợ

Kiểm tay `npm run dev` ở viewport 375px chưa thực hiện trong phiên tự động (ghi trong known
limitations của plan). `JarTransferSheet.tsx` ~220 dòng, hơi vượt guideline 200 dòng/file — chưa tách
thêm vì các sub-component con (`JarTransferEndpointRow`, `JarTransferPicker`,
`JarTransferAmountField`) đã đủ nhỏ và tách thêm sẽ vụn. `docs/ARCHITECTURE.md` còn một ghi chú cũ về
localStorage cho manual txn không còn đúng (pre-existing, không thuộc phạm vi plan này).
