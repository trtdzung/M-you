# Phase 07 — Polish: states, motion, a11y & regression

**Context links:** [plan.md](plan.md) · phase-03..06 · UI/UX Quick Reference (§1–§3 CRITICAL)

## Overview
- **Priority:** P2
- **Status:** done
- Đánh bóng toàn app sau khi IA + màn hình xong: đồng nhất empty/loading/error/insufficient-data, motion mượt (carousel, FAB, on-scroll, route), a11y đầy đủ, và regression test.

## Key insights
- MSB cảm giác "mượt & ấm": bóng mềm, bo tròn, chuyển động nhẹ. Motion phải tôn trọng `prefers-reduced-motion` (đã có guard global).
- Skeleton nên **khớp hình khối** màn thật (không spinner chung) — đã có `Skeleton*`.
- Carousel/FAB/on-scroll là điểm dễ jank/nudge layout → chỉ animate transform/opacity.

## Requirements
- **FR:** mọi màn có 4 trạng thái; carousel snap + dot mượt; FAB press feedback; route transition nhẹ; skeleton khớp khối.
- **NFR:** contrast AA (đo lại chữ muted trên blush/peach); touch ≥44px toàn bộ; focus ring nhất quán; aria-label icon-only; reduced-motion tắt animation; không CLS khi ảnh/carousel load.

## Architecture
- Chuẩn hoá qua primitives/states sẵn có; token motion (duration 150–300ms, ease-out vào / ease-in ra) đồng nhất.
- Không thêm lib; dùng CSS transition + component hiện có.

## Related code files
- **Modify:** `src/components/states/*`, `src/components/home/PromoCarousel.tsx`, `src/components/shell/AssistantFab.tsx`, `src/components/shell/HomeHeader.tsx`, `globals.css` (motion utility nếu cần)
- **Read:** toàn bộ màn từ phase 03–06

## Implementation steps
1. Rà 4 trạng thái từng màn (Home, Accounts+detail, PFM+sub, Settings, Assistant, Transfer) — bổ sung thiếu sót.
2. Skeleton khớp khối từng màn (Home hero/card/grid/carousel; PFM chart; giao dịch rows).
3. Motion: carousel snap + dot transition; FAB scale-on-press (0.95); on-scroll header transform/opacity; route fade nhẹ. Tất cả ≤300ms, transform/opacity only.
4. A11y pass: contrast (dùng UI/UX skill `--domain ux`), touch target, focus ring, aria-label, heading hierarchy, reduced-motion verify.
5. Kiểm CLS: reserve space cho carousel/ảnh banner (aspect-ratio).
6. Regression: chạy full vitest (125 test), sửa nếu vỡ do di dời route/import. `npm run lint` + `build` sạch.
7. So Home cạnh ref lần cuối; chụp `visuals/` before/after nếu cần.

## Todo
- [x] 4 trạng thái đủ mọi màn
- [x] Skeleton khớp khối
- [x] Motion carousel/FAB/header/route (reduced-motion an toàn)
- [x] A11y pass (contrast/touch/focus/aria) đạt checklist
- [x] CLS = 0 (reserve space)
- [x] Full test xanh (148/148, 24 files); lint 0/0; build 0 lỗi (17 route)
- [x] So Home cạnh ref đạt "khó phân biệt"
- [x] `src/app/__tests__/routes.smoke.test.tsx` — 12 route smoke tests phủ mọi route mới/di dời (Red Team #7 gate)

## Success criteria
- Toàn app đồng nhất, mượt, đạt checklist a11y (UI/UX skill §1–§3).
- 125+ test xanh; lint 0/0; build 0 lỗi; không CLS/jank rõ rệt.
- Home vẫn "khó phân biệt" với ref sau polish.

## Risk & mitigation
- *Polish làm vỡ test/route:* chạy vitest liên tục; sửa import theo IA mới.
- *Over-animate:* giới hạn 1–2 element/màn, ≤300ms, tôn trọng reduced-motion.

## Security
- Không đụng luồng dữ liệu/tiền; chỉ trình bày/chuyển động.

## Red Team fixes (2026-09-06)
- **[#7 smoke tests route]** Thêm smoke test cho MỌI route mới/di dời: `/`, `/accounts`, `/accounts/[id]`, `/pfm`, `/pfm/{cashflow,wealth,insights}`, `/settings`, `/assistant`, `/transfer-confirm` (render không throw + landmark). "125 test xanh" KHÔNG đủ — suite cũ không phủ nav/route/page. Đây là gate thực cho IA migration.
- **[#4 on-scroll verify]** Nếu on-scroll được làm (P2): verify hoạt động **trong PhoneShell** (main scroll), không chỉ dev browser; reduced-motion tắt đúng.
- **[#7 CLS/FAB sớm]** Kiểm CLS + FAB không đè nội dung cuối trang phải làm ngay khi dựng (Phase 02/03), KHÔNG đợi tới đây; Phase 07 chỉ là pass cuối.
- **[#15 demo disclosure]** Thêm chỉ báo **"Demo/Prototype"** cố định, tách khỏi chrome clone MSB; xác nhận quyền dùng brand asset (watermark M, banner Apple Pay) trong phạm vi build.
- **[#13 pixel-parity]** So Home cạnh ref theo **persona tham chiếu đã chốt** + kiểm resilience text dài/nhiều persona.

## Next steps
→ `/ck:plan archive` + `/ck:journal`; cập nhật `docs/` nếu IA đổi ảnh hưởng tài liệu.
