# Phase 01 — Design foundation & tokens

**Context links:** [plan.md](plan.md) · [msb-design-tokens.md](../260903-1552-ai-native-facade-migration/reports/msb-design-tokens.md) · refs `ref-ui-msb/1.1`, `1.2`

## Overview
- **Priority:** P0 (nền cho mọi màn)
- **Status:** done
- Chỉnh design tokens + primitives khung để khớp **chính xác** phối màu/độ tròn/bóng của Home MSB thật. Không đổi layout ở phase này — chỉ nền tảng visual.

## Key insights
- Tokens ở `globals.css` đã gần đúng nhưng **gradient hero sai tông**: hiện `#e2301c→#f2621f` (đỏ-cam đậm), ref là **cam thuần fade xuống peach/cream sáng** (đỉnh ~`#F26A2E`, đáy ~`#FBE4D4`), gần dọc (≈180°) chứ không 135°.
- Ref Home dùng nền hero **sáng dần xuống**, watermark chữ "M" **glass mờ** nổi giữa hero.
- Card MSB: bo `24px`, **borderless**, bóng mềm khuếch tán. Divider nội bộ 1px `--color-border`.
- Font Be Vietnam Pro đã nạp đúng (giữ).

## Requirements
- **FR:** Token màu/gradient/radius/shadow khớp ref; utility watermark glass "M"; StatusBar khớp iOS ref (giờ trái, tín hiệu/wifi/pin phải).
- **NFR:** Contrast AA cho chữ trên nền; tôn trọng `prefers-reduced-motion`; không rải hex trong component.

## Architecture
- Nguồn token duy nhất = `src/app/globals.css` (`@theme`). Component tham chiếu biến, không hex rời.
- Watermark "M": component SVG glass `src/components/shell/BrandWatermark.tsx` (translucent, blur) dùng lại ở hero Home + có thể ở empty states.

## Related code files
- **Modify:** `src/app/globals.css` (gradient hero, `--color-*` tinh chỉnh theo ref, thêm `--radius-pill`), `src/components/shell/StatusBar.tsx`
- **Create:** `src/components/shell/BrandWatermark.tsx` (glass "M" SVG), token `.hero-gradient` utility (tách khỏi `.brand-gradient` cũ nếu tông khác nhau giữa hero Home vs banner màn con)
- **Read:** `src/components/primitives/Card.tsx`, `Money.tsx`, `SourceBadge.tsx`

## Implementation steps
1. Đo lại hex từ 2 ảnh ref (đỉnh hero, đáy hero, peach card, muted text). Ghi vào `reports/home-color-probe.md`.
2. Sửa `.brand-gradient` (hoặc thêm `.hero-gradient`) sang cam→peach gần-dọc khớp ref. Giữ `.brand-gradient` cũ cho banner nếu cần tông đậm hơn.
3. Cập nhật `--color-*` lệch so với ref (đặc biệt muted `#8A93A5`, surface-tint `#FCEEE7`, background `#FBE9E3`). Thêm `--radius-pill: 9999px`.
4. Tạo `BrandWatermark.tsx`: SVG chữ "M" ribbon MSB, fill trắng translucent + backdrop-blur, `aria-hidden`.
5. StatusBar: canh khớp ref (font-weight, spacing icon). Giữ presentation-only.
6. Cập nhật `Card.tsx` xác nhận borderless + `shadow-card` + `rounded-card` (nếu còn `border`).

## Todo
- [x] `reports/home-color-probe.md` (hex đo từ ref)
- [x] Gradient hero khớp ref (`.hero-gradient` cam→peach, gần dọc)
- [x] Token màu/radius/pill cập nhật (`--radius-pill` + tokens trong `globals.css`)
- [x] `BrandWatermark.tsx` glass "M"
- [x] StatusBar khớp ref
- [x] `Card` borderless + soft shadow xác nhận
- [x] `npm run lint` + `build` xanh

## Success criteria
- Đặt cạnh ref: nền hero + watermark + card trắng đè lên **không phân biệt được tông màu**.
- Không component nào chứa hex brand rời rạc (grep sạch).

## Risk & mitigation
- *Gradient lệch tông:* dùng color-probe làm chuẩn, so ảnh cạnh nhau trước khi khoá.
- *Watermark che chữ:* giữ opacity thấp (≤0.18) + chỉ trên vùng hero không có text thường.

## Security
- Không có bề mặt dữ liệu mới; thuần presentation.

<!-- Updated: Validation Session 1 — DEMO badge, thuộc M1 -->
## Validation update (Session 1 — 2026-09-06)
- **[Milestone]** Phase 01 thuộc **M1**.
- **[#15 DEMO badge]** Tạo `src/components/shell/DemoBadge.tsx`: nhãn "DEMO" cố định, kín đáo (vd cạnh StatusBar / góc màn), luôn hiện, tách khỏi chrome clone MSB, không phá layout. Render trong `PhoneShell`. Verify ở Phase 07.
  - **Todo:** [x] `DemoBadge.tsx` cố định kín đáo + gắn vào PhoneShell

## Next steps
→ Phase 02 dùng tokens này cho shell/nav 3-tab.
