# Phase 04 — Tab Tài khoản (accounts → detail → giao dịch)

**Context links:** [plan.md](plan.md) · phase-02 (route), phase-03 (Home) · design language từ Home

## Overview
- **Priority:** P1
- **Status:** done
- Dựng tab **Tài khoản**: danh sách tài khoản → chi tiết tài khoản → **danh sách giao dịch** (di dời `/transactions` vào đây). Theo ngôn ngữ thiết kế MSB (không có ref riêng).

## Key insights
- Ref chỉ có Home nên đây là **suy diễn**: dùng token/card/nav/typography từ Home. Header màn con = title lớn navy trên nền blush (theo token report cũ).
- `/transactions` hiện có: PeriodPicker, BudgetList (ngân sách), TxnFilters, TxnRow, CategoryEditor — tái dùng nguyên, chỉ đổi vị trí + vỏ.
- Account detail cần hiển thị số dư (mask/eye tùy chọn), số TK, freshness/source.

## Requirements
- **FR:** `/accounts` list các account (tên/hạng, số TK, số dư, source badge); chọn → `/accounts/[id]` detail (số dư, thông tin, nút xem giao dịch); giao dịch lọc theo account + tháng.
- **NFR:** provenance đầy đủ; empty (no account), loading, error, insufficient-data; touch ≥44px.
- **Bất biến:** dữ liệu qua `AccountDataProvider`/`TransactionDataProvider`; pending tách posted; transfer nội bộ loại khỏi thu/chi.

## Architecture
- `/accounts` (list) → `/accounts/[id]` (detail + entry giao dịch). Giao dịch có thể là section trong detail hoặc `/accounts/[id]/transactions`.
- Tái dùng: `TxnRow`, `TxnFilters`, `CategoryEditor`, `BudgetList` (cân nhắc chuyển BudgetList sang PFM hub nếu hợp hơn — quyết định khi implement, mặc định giữ ở giao dịch).
- Component mới: `AccountListItem`, `AccountDetailHeader`.

## Related code files
- **Create:** `src/app/accounts/page.tsx` (list), `src/app/accounts/[id]/page.tsx` (detail+giao dịch), `src/components/accounts/AccountListItem.tsx`, `src/components/accounts/AccountDetailHeader.tsx`
- **Modify/Move:** logic từ `src/app/transactions/page.tsx` → dùng lại trong accounts; giữ `/transactions` redirect tới `/accounts` (hoặc giữ như "tất cả giao dịch")
- **Read:** `src/providers/interfaces.ts`, `src/state/useFinancials.ts`, `src/domain/engine`

## Implementation steps
1. `/accounts`: list account từ provider (spend + credit_card riêng nhóm nếu cần), mỗi item: tên/hạng, số TK, số dư (mask option), `SourceBadge` + `Freshness`.
2. `AccountListItem` component (card row, chevron, touch ≥44px).
3. `/accounts/[id]`: `AccountDetailHeader` (tên, số TK, số dư lớn, mask/eye, source/freshness) + section giao dịch (tái dùng TxnFilters/TxnRow lọc theo accountId + period).
4. Tích hợp `CategoryEditor` (giữ chức năng sửa danh mục).
5. Quyết định vị trí BudgetList: mặc định giữ trong luồng giao dịch; nếu chuyển PFM hub thì cập nhật phase-05.
6. Redirect/`/transactions`: giữ đường cũ hoạt động (redirect hoặc "tất cả giao dịch" gộp mọi account).
7. Phủ empty/loading/error/insufficient-data.

## Todo
- [x] `/accounts` list qua provider + provenance
- [x] `AccountListItem`
- [x] `/accounts/[id]` detail + header (`AccountDetailHeader`)
- [x] Giao dịch theo account (tái dùng `TransactionListSection` dùng chung với `/transactions`)
- [x] `/transactions` giữ nguyên là view tổng hợp mọi TK (không gãy, không redirect — chốt theo Red Team #10)
- [x] States đầy đủ; lint/build xanh; test xanh (148 test)

## Success criteria
- Từ tab Tài khoản: xem list → detail → giao dịch của account, sửa danh mục hoạt động.
- Đồng nhất design language Home; provenance hiển thị; không mất chức năng `/transactions`.

## Risk & mitigation
- *Trùng lặp logic lọc giao dịch:* trích hook/hàm lọc dùng chung, tránh copy.
- *Mất BudgetList khi di chuyển:* quyết định vị trí rõ ràng, cập nhật cross-reference.

## Security
- Số TK từ provider (mock hợp lệ), không bịa; không thao tác tiền.

## Red Team fixes (2026-09-06)
- **[#10 chốt định tuyến]** `/transactions` **GIỮ NGUYÊN** làm view **tổng hợp mọi TK** (list + filter + CategoryEditor) — **KHÔNG** redirect. `/accounts/[id]` chỉ là view **lọc theo 1 TK** (tái dùng `TxnFilters`/`TxnRow`/`CategoryEditor` + hook lọc dùng chung). Hết triple-route.
- **[#10 BudgetList]** BudgetList **chuyển sang PFM hub (Dòng tiền, Phase 05)** — bỏ khỏi luồng giao dịch ở đây. Cập nhật cross-ref Phase 05.
- **[#1 dữ liệu]** List/detail hiển thị `tier`/`maskedNumber` từ provider (Phase 00), số TK last-4 mask.
- **[#8 redirect]** Không áp cho `/transactions` (giữ). Cơ chế redirect chung định ở Phase 02 nếu có route con cần.
- **[#7 DoD]** Thêm smoke test route `/accounts`, `/accounts/[id]` (render không throw + landmark).

## Next steps
→ Phase 05 PFM hub; phase 06 settings/assistant/transfer.
