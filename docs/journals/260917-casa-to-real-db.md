# CASA sang DB thật (bảng `accounts` là nguồn sự thật)

Date: 2026-09-17

## Bối cảnh

Nối tiếp [envelope-label model](./260917-transfer-debit-real-balance.md). Ở vòng
đó số dư tài khoản vẫn là fixture in-memory + một lớp overlay debit lưu trong
`localStorage` (`account-adjustments`). Người dùng hỏi "data casa đang store tại
đâu" rồi chốt **chuyển sang DB thật** — scope B: bảng `accounts` đầy đủ trong
SQLite, DB là nguồn sự thật (giống `jars`).

## Quyết định

CASA = Σ `availableBalance` của các tài khoản `current`, đọc thẳng từ DB. Không
còn overlay client. Mỗi giao dịch xác nhận DEBIT trực tiếp vào row (mock
core-banking) nên tiền rời đi thật và persist qua reload/thiết bị.

## Thay đổi

- `data/schema.sql` / `schema.md` — thêm bảng `accounts` (PK `(cif,id)`,
  `balance`/`available_balance` REAL, `source` CHECK, `tier` nullable,
  `sort_order`) + index `idx_accounts_cif`.
- `providers/mock/fixtures/generate.ts` — tách `buildPersonaAccounts(meta)` làm
  builder chính tắc; fixtures, `accounts-store` và `seed-db.mjs` đều seed từ đây
  nên số dư/số TK không bao giờ lệch.
- `lib/accounts-store.ts` (mới, server-only) — `readAccounts` (lazy-seed nếu
  rỗng), `debitAccount` (UPDATE `MAX(0, balance-@amount)` cho cả hai cột).
- `app/api/accounts/route.ts` + `app/api/accounts/debit/route.ts` (mới) — ranh
  giới HTTP duy nhất để browser chạm DB (invariant #4); `/debit` chỉ đến từ luồng
  Chuyển tiền người-dùng-xác-nhận, không bao giờ từ AI facade (invariant #3).
- `providers/mock/mock-provider.ts` — `listAccounts` fetch `/api/accounts`;
  `applyAccountDebit` POST `/api/accounts/debit`. Bỏ resource
  `accountAdjustments` + `getAccountAdjustments`.
- `lib/casa-pool.ts` — đọc `readAccounts(cif)` thay vì công thức persona.
- `state/useFinancials.ts`, `components/transfer/TransferCompose.tsx` — bỏ
  `applyAccountAdjustments`; dùng thẳng accounts đã DB-backed.
- `scripts/seed-db.mjs` — seed 3 tài khoản × 3 persona (port công thức
  18tr/45tr/-8tr/50tr × scale, số TK + mask).
- XOÁ `lib/account-adjustments.ts` + test của nó (overlay không còn tồn tại).
- `test-utils/mock-jars-fetch.ts` — thêm in-memory accounts store + handler cho
  `/api/accounts` & `/api/accounts/debit` (stub ranh giới fetch cho test render
  provider thật); `casaFor` giờ lấy từ store này.
- `app/api/jars/__tests__/route.test.ts` — thêm DDL bảng `accounts` vào DB
  in-memory (casa-pool nay đọc bảng này; lazy-seed → CIF_0001 vẫn 18tr).

## Verify end-to-end (Playwright, persona Ly Lã, DB thật)

| Bước | TK chính (DB) |
|---|---|
| Ban đầu | 18.000.000 |
| Màn Chuyển tiền hiển thị nguồn | 18.000.000 ✓ (fit thực tế) |
| Xác nhận chuyển 3tr (tự nhập OTP) | 15.000.000 ✓ (trừ thật) |
| Reload + đăng nhập lại → màn Chuyển tiền | 15.000.000 ✓ (persist) |

`tsc` sạch · lint sạch (chỉ 1 warning cũ không liên quan) · **558 tests / 87
files pass**. DB commit đã reseed về trạng thái sạch (18tr).
