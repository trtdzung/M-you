# 2026-09-15 — Brainstorm + plan: phân loại category cho chuyển tiền

## Bối cảnh
Yêu cầu: tại màn "chuyển tiền thành công", cho người dùng tự chọn category giao dịch; nguồn là hũ → category giới hạn trong hũ; nguồn tài khoản → chưa có hướng.

## Quyết định (qua brainstorm)
- No-hũ fallback = full expense picker + "Không phân loại".
- Phân loại tuỳ chọn, có default (không chặn luồng).
- Luôn tạo txn self_reported cho mọi transfer.

## Phát hiện code quan trọng
- `cashflow.ts` loại transfer khỏi chi/thu theo `type` (`EXPENSE_TYPES={expense,fee}`), không theo category ⇒ default `type:"transfer"` tự động sạch, không cần sửa engine.
- `manual-txns.tsx` không tạo được `type:"transfer"`, `add` không trả id, thiếu `update` ⇒ phải mở rộng.
- `TransferConfirm.confirm()` chỉ jar-sourced tạo txn (dùng `categoryIds[0]`); account-sourced không tạo gì.
- one-category-one-hũ ⇒ khoá picker theo hũ nguồn để không phá `spendFromJar()`.
- Envelope plan `260914-1436-*` đã Done; transfer-phân-loại-thành-expense sẽ feed vào "spent" (đúng ý đồ), không blocking.

## Sản phẩm
- Design doc: `plans/reports/brainstorm-260915-transfer-category-selection.md`
- Plan 5 phase: `plans/260915-1705-transfer-category-selection/`

## Chưa làm
- Chưa implement (chờ /ck:cook). Task hydration bỏ qua (Task tools CLI-only, không có ở session này).
