# Chuyển tiền — trừ tiền thật khỏi số dư (envelope-label model)

Date: 2026-09-17

## Vấn đề (báo cáo)

1. Số dư trong màn "Chọn tài khoản nguồn" không fit thực tế.
2. Mỗi giao dịch chuyển tiền thành công KHÔNG trừ tiền thật trong hũ hay tài
   khoản chính.

## Nguyên nhân

`TransferConfirm.confirm()` chỉ trừ tiền cho luồng **hũ làm nguồn** (debit cả
`actualAmount` của hũ lẫn tài khoản CASA). Luồng **tài khoản làm nguồn** (mặc
định) chỉ ghi một txn `type:transfer` và **không** gọi `applyAccountDebit` →
số dư không bao giờ giảm. Ngoài ra `applyAccountAdjustments` chỉ hạ `balance`,
bỏ quên `availableBalance` (nguồn của CASA pool → net worth / runway / "Chờ
phân bổ") nên các số dẫn xuất bị stale.

## Quyết định (chốt với người dùng)

**Envelope-label model**: tài khoản chính giữ số dư ĐẦY ĐỦ; hũ là "nhãn" trên
cùng một pot tiền CASA. Mọi giao dịch (từ TK hay hũ) đều trừ tổng tài khoản;
giao dịch từ hũ trừ thêm số dư hũ đó.

## Thay đổi

- `lib/account-adjustments.ts` — debit hạ CẢ `balance` lẫn `availableBalance`
  (sàn 0) → mọi số hiển thị & dẫn xuất phản ánh tiền đã rời tài khoản.
- `lib/transfer-draft-store.ts` — thêm `sourceAccountId` (CASA account tiền
  thực sự rời đi); draft cũ không có → fallback về tài khoản `current` duy nhất.
- `components/transfer/TransferCompose.tsx` — set `sourceAccountId` cho cả hai
  loại nguồn; chặn chuyển vượt số dư nguồn (`numericAmount <= balance`).
- `app/transfer-confirm/TransferConfirm.tsx` — trừ tài khoản nguồn cho MỌI giao
  dịch (không chỉ hũ); hũ trừ thêm `actualAmount` như cũ. Debit async chạy
  trước mọi ghi ledger cục bộ để lỗi provider không để lại trạng thái dở dang.

## Verify end-to-end (Playwright, persona Ly Lã)

| Bước | TK chính | Hũ Ăn uống |
|---|---|---|
| Ban đầu | 18.000.000 | 4.000.000 |
| Chuyển 2tr từ TK chính | 16.000.000 | 4.000.000 |
| Chuyển 1tr từ hũ Ăn uống | 15.000.000 | 3.000.000 |

Số dư khớp nhau ở cả Trang chủ lẫn màn "Chọn tài khoản nguồn". `account-adjustments`
= 3.000.000. Tests: 562 pass, tsc sạch, lint sạch. Thêm test
`lib/__tests__/account-adjustments.test.ts` và khoá hành vi debit trong
`TransferConfirm.test.tsx`.
