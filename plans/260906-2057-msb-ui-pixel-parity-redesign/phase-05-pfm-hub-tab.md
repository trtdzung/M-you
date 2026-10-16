# Phase 05 — Tab PFM hub (dòng tiền + tài sản + net worth + gợi ý)

**Context links:** [plan.md](plan.md) · phase-02 (route), phase-03 (Home) · design language từ Home

## Overview
- **Priority:** P1
- **Status:** done
- Gộp các feature phân tích PFM vào **một tab PFM** (thay Cài đặt trong bar): Giá trị ròng, Dòng tiền (cashflow), Tài sản (wealth), Gợi ý (insights). Ngôn ngữ thiết kế MSB.

## Key insights
- `/cashflow`, `/wealth` hiện là trang đầy đủ (charts Recharts, AccordionCard, NetWorthCard, AllocationList, IncomeExpense/CategoryBars/NetWorthTrend). Tái dùng nội dung, tổ chức lại thành hub có điều hướng nội bộ.
- Insights (`runDetectors` + `InsightCard` + `useInsights`) đang nằm ở Home cũ — chuyển "trang quản lý gợi ý đầy đủ" về PFM hub; Home chỉ giữ 1 card insight trong carousel.
- Không có ref riêng → dùng token/card/typography Home; header màn con title lớn navy.

## Requirements
- **FR:** PFM hub có mục con: Tổng quan tài chính (net worth + dòng tiền tháng + delta), Dòng tiền (chi tiết cashflow), Tài sản (wealth), Gợi ý (danh sách insight + dismiss/snooze/helpful). Điều hướng nội bộ (tab con/section/sub-route).
- **NFR:** charts responsive + có bảng/nhãn thay thế (a11y), empty/loading/error/insufficient-data, provenance mọi số.
- **Bất biến:** mọi số từ engine/provider; missing≠0; internal transfer loại khỏi thu/chi; category là data.

## Architecture
- `/pfm` = hub landing (net worth card + dòng tiền tháng + entry tới Dòng tiền/Tài sản/Gợi ý). Mục con:
  - `/pfm/cashflow` (di dời `/cashflow`), `/pfm/wealth` (di dời `/wealth`), `/pfm/insights`.
  - Hoặc dạng segmented control trong `/pfm` — chọn khi implement (mặc định sub-route để deep-link).
- Tái dùng toàn bộ component charts/wealth/cashflow/insights hiện có; chỉ thay vỏ ScreenHeader + bố cục.
- Giữ redirect `/cashflow`→`/pfm/cashflow`, `/wealth`→`/pfm/wealth`.

## Related code files
- **Create:** `src/app/pfm/page.tsx` (hub), `src/app/pfm/cashflow/page.tsx`, `src/app/pfm/wealth/page.tsx`, `src/app/pfm/insights/page.tsx`, `src/components/pfm/PfmHubNav.tsx` (segmented/entry)
- **Modify/Move:** nội dung `src/app/cashflow/page.tsx`, `src/app/wealth/page.tsx` → dưới `/pfm`; insights section từ `page.tsx` cũ → `/pfm/insights`
- **Read:** `src/components/charts/*`, `src/components/wealth/*`, `src/components/cashflow/*`, `src/components/insights/*`, `src/state/useInsights.ts`

## Implementation steps
1. `/pfm` hub: NetWorthCard + card dòng tiền tháng (income/expense/net + DeltaBadge) + PeriodPicker + entry tới 3 mục con.
2. `PfmHubNav`: điều hướng nội bộ (segmented control hoặc list card).
3. Di dời cashflow: tạo `/pfm/cashflow` dùng nội dung `/cashflow` cũ, đổi ScreenHeader; redirect route cũ.
4. Di dời wealth: `/pfm/wealth` tương tự.
5. `/pfm/insights`: danh sách đầy đủ `runDetectors` + `InsightCard` + actions (dismiss/snooze/helpful) từ `useInsights`.
6. Phủ empty/loading/error/insufficient-data ở mọi mục; giữ chart a11y (bảng/nhãn).
7. Kiểm tra deep-link route cũ redirect đúng.

## Todo
- [x] `/pfm` hub (net worth + dòng tiền + "Sắp phải trả" obligations + entry)
- [x] `PfmHubNav`
- [x] `/pfm/cashflow` (di dời `CashflowView`, `/cashflow` → `redirect()`)
- [x] `/pfm/wealth` (di dời `WealthView`, `/wealth` → `redirect()`)
- [x] `/pfm/insights` (danh sách + actions)
- [x] States đầy đủ; chart a11y giữ nguyên
- [x] Test cashflow/wealth/insights cũ vẫn xanh; lint/build xanh

## Success criteria
- Một tab PFM truy cập đủ dòng tiền, tài sản, net worth, gợi ý — không mất chức năng so với 3 trang cũ.
- Đồng nhất design language Home; provenance + states đầy đủ.

## Risk & mitigation
- *Hub quá tải:* chia sub-route rõ ràng, landing chỉ tóm tắt + entry.
- *Vỡ test do đổi path import:* cập nhật import, chạy vitest sau mỗi di dời.

## Security
- Chỉ đọc/hiển thị; không thao tác tiền.

## Red Team fixes (2026-09-06)
- **[#10 BudgetList]** BudgetList **về PFM hub** (mục Dòng tiền) — nhận từ Phase 04. Thêm section + todo + empty state ở đây; xác nhận đã landed (chống rơi/nhân đôi khi 04/05 làm song song).
- **[#3 obligations]** Nếu Phase 03 không giữ "Sắp phải trả" ở Home → **PFM hub là đích** cho obligations (`ObligationsList`). Chốt 1 nơi, không cả hai.
- **[#8 redirect]** `/cashflow`→`/pfm/cashflow`, `/wealth`→`/pfm/wealth` = **thin Server Component gọi `redirect()`** (cơ chế chốt ở Phase 02). File route cũ bỏ `"use client"`.
- **[#7 DoD + smoke test]** Thêm smoke test cho `/pfm`, `/pfm/cashflow`, `/pfm/wealth`, `/pfm/insights`.
- **[#8/S8 nav pattern]** Chốt **sub-route** cho hub (deep-link) thay vì segmented-control-in-place — bỏ nhánh "quyết định khi implement".

## Next steps
→ Phase 06 settings/assistant/transfer; phase 07 polish.
