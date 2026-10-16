# Phase 02 — Shell, nav & IA rework (5-tab → 3-tab MSB)

**Context links:** [plan.md](plan.md) · phase-01 (tokens) · refs `1.1` (bottom nav), `1.2`

## Overview
- **Priority:** P0
- **Status:** done
- Chuyển khung điều hướng từ 5 tab PFM sang **3 tab MSB** (Trang chủ · Tài khoản · PFM), dời Cài đặt vào header gear, thêm **FAB Trợ lý AI** dùng chung. Đây là bước "sắp xếp lại toàn bộ feature".

## Key insights
- Ref bottom nav: **3 tab** pill trắng nổi, tab active (Trang chủ) = icon cam đặc + label cam; tab thường icon+label navy/muted. Có 3 mục: Trang chủ / Tài khoản / Cài đặt.
- Ta thay **Cài đặt → PFM** trong bar (quyết định user); Cài đặt lên header gear/profile.
- FAB phải hiện xuyên các màn nhưng **không đè** bottom nav — đặt trên nav, phải trái an toàn, tránh safe-area.
- `PhoneShell` render `nav` ghim đáy; FAB nên là slot riêng trong shell để nằm đúng lớp z.

## Requirements
- **FR:** BottomNav 3 tab đúng route; header có gear → `/settings`; FAB → `/assistant` (hoặc mở panel). Route cũ được map/redirect hợp lý, không 404.
- **NFR:** touch ≥44px, `aria-current` cho tab active, focus ring; FAB có `aria-label`; nav + FAB tôn trọng safe-area.

## Architecture
- **Tabs:** `/` (Trang chủ), `/accounts` (Tài khoản — mới), `/pfm` (PFM hub — mới).
- **Route dời:** `/cashflow`, `/wealth`, `/transactions` trở thành màn con dưới `/pfm` và `/accounts` (giữ route để deep-link, hoặc chuyển thành sub-route — xem phase 04/05). Phase 02 chỉ dựng khung + placeholder cho `/accounts`, `/pfm`, `/settings`.
- **FAB:** `src/components/shell/AssistantFab.tsx`, render trong `PhoneShell` cạnh `nav`.
- **Settings entry:** thêm gear/profile vào header dùng chung (BrandHeader mở rộng hoặc ScreenHeader action).

## Related code files
- **Modify:** `src/components/shell/BottomNav.tsx` (3 tab), `src/components/shell/PhoneShell.tsx` (thêm slot FAB), `src/app/layout.tsx` (truyền FAB), `src/components/shell/BrandHeader.tsx` (gear → settings)
- **Create:** `src/components/shell/AssistantFab.tsx`, `src/app/accounts/page.tsx` (placeholder), `src/app/pfm/page.tsx` (placeholder), `src/app/settings/page.tsx` (placeholder)
- **Read:** `src/app/*/page.tsx` (để biết route cần map)

## Implementation steps
1. Viết lại `BottomNav.tsx`: 3 tab (Trang chủ `LayoutGrid`/home icon, Tài khoản `Wallet`, PFM `TrendingUp`/`PieChart`). Active = pill peach + cam. Giữ `isActive` xử lý sub-route.
2. Tạo `AssistantFab.tsx`: nút tròn cam (gradient), icon `Sparkles`, bóng nổi, `aria-label="Trợ lý AI"`, link `/assistant`. Ẩn khi đang ở `/assistant`.
3. Sửa `PhoneShell` nhận thêm `fab?` slot, đặt absolute trên nav (bottom offset > nav height), pointer-events đúng.
4. `layout.tsx`: truyền `<AssistantFab/>`.
5. `BrandHeader`: thêm nút gear (tone-aware) → `/settings` (giữ bell + search theo ref Home).
6. Tạo placeholder `/accounts`, `/pfm`, `/settings` (dùng `PlaceholderScreen` hiện có) để nav không gãy. Chi tiết ở phase 04/05/06.
7. Đảm bảo route cũ vẫn mở được (deep-link) — tạm giữ trang cũ, phase sau nhúng vào IA mới.

## Todo
- [x] BottomNav 3 tab + active state khớp ref
- [x] AssistantFab (ẩn ở `/assistant`, safe-area, a11y)
- [x] PhoneShell slot FAB đúng z-layer
- [x] Header gear → `/settings` — **đảo hướng theo Red Team #6/validation**: KHÔNG thêm gear (giữ header pixel-parity); entry Cài đặt = account-card sheet/tap-through → `/settings` (xem Phase 03/06)
- [x] `/accounts` `/pfm` `/settings` dựng đầy đủ trong cùng đợt M2 (không dừng ở placeholder — xem Phase 04/05/06)
- [x] Không route nào 404; lint/build xanh

## Success criteria
- Bottom nav 3 tab giống ref; chuyển tab mượt, active đúng.
- FAB hiện mọi màn trừ `/assistant`, không đè nav, không vướng safe-area.
- Mọi feature cũ vẫn tới được (qua tab/sub-route/FAB/gear).

## Risk & mitigation
- *Mất truy cập feature khi bỏ tab:* giữ route cũ + đặt entry rõ trong Home grid/PFM hub trước khi xoá.
- *FAB đè nội dung cuối trang:* tăng `pb` của `<main>` để chừa chỗ FAB + nav.

## Security
- Không thay đổi luồng dữ liệu/tiền; thuần điều hướng.

## Red Team fixes (2026-09-06)
- **[#5 atomic-ship gate]** Phase 02 KHÔNG merge lên `main` khi `/accounts` `/pfm` còn placeholder. Nav mới + đích IA (04–06) lên **cùng một đợt**. Trong lúc chưa xong, giữ nav cũ hoặc để entry Home cũ hoạt động.
- **[#6 Settings placement]** **KHÔNG** thêm gear vào header (giữ pixel-parity: chỉ logo + chuông). Entry Cài đặt đặt ở **account card** (chạm avatar/tên → sheet hồ sơ & cài đặt). Bỏ FR "header có gear" cũ.
- **[#8 redirect mechanism]** Chốt 1 lần tại đây: route di dời = **thin Server Component gọi `redirect()` từ `next/navigation`** (bỏ `"use client"` ở file route cũ). Phase 04/05/06 tái dùng đúng cơ chế này. `/transactions` KHÔNG redirect (xem #10).
- **[#7 DoD]** Mỗi phase (02–06) tự phủ empty/loading/error + smoke test route, KHÔNG dồn hết sang Phase 07.

<!-- Updated: Validation Session 1 — Phase 02 thuộc M2 -->
## Validation update (Session 1 — 2026-09-06)
- **[Milestone]** Phase 02 thuộc **M2** (IA cutover atomic). Ở **M1**, nav chỉ **restyle thị giác** trên khung route hiện có; Phase 02 (đổi 3-tab + tạo `/accounts` `/pfm` `/settings`) chạy ở M2 cùng 04/05/06.
- **[#6 Settings]** Xác nhận: entry Cài đặt = **sheet từ account card** (không gear header). `/settings` là đích của sheet.

## Next steps
→ Phase 03 dựng Home thật trên khung này.
