# 2026-09-23 — Tách HẠN MỨC (limit) khỏi SỐ DƯ (balance) của hũ (plan `260923-jar-limit-vs-balance-split`)

## Vấn đề

Mô hình "Hũ một con số": `budgetLimit` vừa là tiền phân bổ, vừa là trần chi, vừa là số dư.
Hệ quả: số dư reset về hạn mức mỗi tháng (không mang sang), nạp thêm tiền = sửa kế hoạch,
và top-up chỉ sống trong session (`jar-topup.tsx`). Người dùng không thể có "hạn mức 7tr/tháng,
đang có 4tr trong hũ".

## Quyết định (người dùng chốt, xem plan.md → Decisions)

- **Hạn mức** = kế hoạch tháng (`jars.budget_limit`), `overLimit = đã chi tháng > hạn mức`, reset mỗi tháng.
- **Số dư** = `Σ nạp − Σ rút − Σ chi[anchor, asOf] + Σ điều chỉnh hũ[anchor, asOf]`, mang sang tháng.
  Anchor = `jars.created_at`. Chưa có dòng ledger ≤ asOf, hoặc tháng trước anchor → `null` ("Chưa có số dư").
- Bảng mới `jar_ledger` (deposit/withdraw, `is_opening`, `self_reported`); một cửa ghi duy nhất
  `POST /api/jar-ledger` (batch atomic, cap CASA kiểm một lần). Batch `PATCH /api/jars` + `updateJars` bị xoá.
- Tạo hũ bắt buộc cả hạn mức và số dư ban đầu (0 hợp lệ). `PUT` (template) không tạo tiền.
- Migration: mỗi hũ có hạn mức (kể cả 0) nhận một khoản nạp mở đầu = hạn mức ở đầu tháng demo; backup DB trước.

## Đã làm (6 phase)

01 schema + migration + backup + ledger store · 02 engine `jar-balance.ts` (case A–L) + đổi tên
`remaining → balance` · 03 API tạo hũ có số dư, `/api/jar-ledger`, guard (Khác, rút quá số dư, cap) ·
04 UI (Số dư vs Đã chi/hạn mức, AllocationSheet thành "nạp thêm", HuCreateSheet/HuBalanceField), xoá
`jar-topup.tsx` + `use-casa-pool.ts` · 05 auto-fund snapshot theo số dư tại `postedAt`, insight, agent card
`initial_balance` · 06 test sweep + tài liệu.

## Bài học

- **Một đồng hồ duy nhất.** `DEMO_NOW` (00:00) ở đường đọc làm "mất" khoản nạp vừa ghi lúc 10:30 bằng
  `transferNow()`. Mọi đường đọc/ghi số dư giờ nhận `now` inject; phase 06 bắt thêm `useAutoFund` còn
  dùng `DEMO_NOW` và đổi sang `transferNow()`.
- **Hai mốc cắt khác nhau.** Ledger cắt ở `asOf = min(period.to, now)`, nhưng giao dịch posted cắt ở
  `period.to` — posting là sự thật ngân hàng đã nằm trong CASA và `spent`; cắt theo giờ demo làm vỡ
  đẳng thức `pool + Σ spendable = CASA`.
- **D26 cần một test chéo.** Card "Chờ phân bổ", "Còn lại để chia", picker "Chưa phân bổ" và cap server
  tính ở bốn chỗ; `jar-pool-parity.test.ts` tái hiện đúng từng công thức và khoá chúng bằng một con số
  sau nạp, rút, chi, điều chỉnh.
- Đổi tên cơ học bỏ sót fixture không type-check (`linesFrom({ remaining })` trong `TransferConfirm.test.tsx`)
  — grep audit ở cuối là cần thiết, không chỉ `tsc`.

## Rủi ro chấp nhận

Đổi category của hũ làm số dư thay đổi hồi tố (chi tiêu từ anchor được gán lại). Pool có thể âm khi CASA
bị chi ngoài hũ (`overAllocated`). Không có ràng buộc cif/session phía server (toàn prototype).

## Trạng thái

tsc: chỉ 4 lỗi có sẵn (`UnlabeledSpendSheet.test.tsx`). Vitest xanh toàn bộ. `npm run lint` (`next lint`)
chưa có cấu hình ESLint nên không chạy được không tương tác.

## Sau review

Code review 8/10, 1 High: `liveTxns` phía server (cap + kiểm tra rút) bỏ qua category corrections và
txn bị ẩn, nên có thể lệch với số dư đang hiển thị. Đã sửa `jar-write-guards.ts` dùng cùng pipeline
`applyCorrections` + `isHidden` như `jar-summary`/`useFinancials`; thêm 3 test hồi quy (fail khi bỏ fix).
Vitest 1290/1290.
