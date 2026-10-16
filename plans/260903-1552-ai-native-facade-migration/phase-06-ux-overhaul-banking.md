# Phase 06 — Đại tu UX chuẩn banking MSB (bám 4 screenshot thật)

**Brainstorm:** Phase 2 · **Backlog:** PFM-006, EPIC-01 · **Priority:** P2 · **Status:** ✅ DONE (2026-09-04)

> **Unblocked 2026-09-04:** đã có 4 screenshot MSB thật trong `ref-ui-msb/`. Token chuẩn:
> [reports/msb-design-tokens.md](reports/msb-design-tokens.md).
> **Quyết định (user):** (1) **Apply design language** — reskin màn PFM hiện có, KHÔNG clone 1:1
> app mẹ; (2) **giữ 5 tab**, restyle thành floating pill; (3) font **Be Vietnam Pro**.

## Mục tiêu

Reskin toàn bộ shell + màn hình PFM sang **ngôn ngữ thiết kế MSB thật** (cam-đỏ gradient, mực
navy, nền blush, card borderless bo tròn, nav pill nổi, icon 2 tông). Sửa lỗi format mobile
**tận gốc**. **Không đổi** provider/engine/AI contract — chỉ presentation.

## Bất biến (không phá)
- UI đi qua provider interface, không import fixture. Mọi số vẫn kèm period/source/freshness.
- Giữ đủ empty/loading/error/insufficient-data (Phase 07 rà kỹ, Phase 06 không được làm mất).
- Grounding/validator không đổi; source chip không sinh số mới.

## Related code
**Modify (tokens & shell):**
- `src/app/globals.css` — thay bảng token (màu/radius/shadow) theo design-tokens.md.
- `src/app/layout.tsx` — nạp Be Vietnam Pro qua `next/font/google` (subset `vietnamese`), gắn vào `--font-sans`.
- `src/components/shell/PhoneShell.tsx` — nền blush, padding an toàn cho nav nổi.
- `src/components/shell/BottomNav.tsx` — floating pill 5 tab, active pill peach + icon cam.
- `src/components/shell/ScreenHeader.tsx` — title lớn navy trên nền blush (bỏ style card cũ).
- `src/components/shell/StatusBar.tsx` — tinh chỉnh nhẹ cho khớp (không bắt buộc).
- `src/components/primitives/Card.tsx` — borderless `rounded-[24px]` + soft shadow; thêm variant `tint` (peach) và `hero` (gradient).
- `src/components/primitives/{Stat,Money,SectionHeader,SourceBadge}.tsx` — chỉnh màu/size theo token mới (đổi biến, không đổi API).

**Create (pattern MSB tái dùng):**
- `src/components/shell/BrandHeader.tsx` — hero gradient cho Overview: logo M + search + bell(badge).
- `src/components/common/QuickActions.tsx` — lưới 3 cột icon+label (khối peach kiểu Home MSB), reusable.
- `src/components/common/AccordionCard.tsx` — card gập được (icon + label + chevron) cho Wealth (kiểu Tài sản).

**Reskin theo màn (dùng component trên, không đổi data flow):**
- `src/app/page.tsx` (Overview) · `src/app/transactions/page.tsx` · `src/app/cashflow/page.tsx` · `src/app/wealth/page.tsx` · `src/app/assistant/page.tsx`.
- `src/components/assistant/ChatPanel.tsx` (+ ChatMessage/Composer/SourceChips) — reskin token mới.

## Implementation steps (thứ tự bắt buộc — nền tảng trước, màn sau)

1. **Token + font (nền tảng).** Viết lại `globals.css` theo design-tokens.md (primary cam
   `#F26522`, background blush, radius-card 24px, soft shadow, bỏ viền cứng). Nạp Be Vietnam Pro
   ở `layout.tsx`, map vào `--font-sans`. → `npm run build` phải xanh trước khi đi tiếp.
2. **Card primitive.** Borderless + `rounded-[24px]` + soft shadow, thêm `variant?: "plain" | "tint" | "hero"`. Giữ API `as`/`className`.
3. **Shell.** PhoneShell nền blush + safe padding đáy cho nav nổi. BottomNav → pill trắng nổi
   (`mx-3 mb-3 rounded-full shadow-lg`), 5 tab, active = pill peach bọc icon+label cam, thường
   navy/muted. ScreenHeader → title lớn navy.
4. **BrandHeader + QuickActions.** Dựng hero gradient (logo M mark + search + bell badge) và lưới
   quick-action; ráp vào đầu Overview.
5. **AccordionCard.** Dựng card gập; áp vào Wealth (nhóm Tài khoản/Tiền gửi/Thẻ/Vay như ảnh Tài sản).
6. **Reskin từng màn** (Overview → Transactions → Cashflow → Wealth → Assistant): thay `Card`/spacing/màu
   theo token; giữ nguyên hook dữ liệu, provenance, state. Fix lỗi mobile tận gốc (overflow số dài,
   touch target ≥44px, wrap tiếng Việt, an toàn safe-area).
7. **ChatPanel reskin.** Áp token mới cho bubble/composer/source-chip; giữ streaming + grounding.
8. Sau mỗi component/màn: `npm run build` + `npm run lint`. Kết thúc: chạy `npm test` (không được đỏ test cũ).

## Todo
- [x] 1. globals.css tokens + Be Vietnam Pro (build xanh)
- [x] 2. Card primitive borderless + variants
- [x] 3. PhoneShell + BottomNav pill + ScreenHeader
- [x] 4. BrandHeader + QuickActions → Overview
- [x] 5. AccordionCard → Wealth
- [x] 6. Reskin Transactions / Cashflow / Assistant
- [x] 7. ChatPanel reskin
- [x] 8. build + lint + test xanh (94/94); code-review + fix a11y

> **Hoàn thành 2026-09-04:** reskin xong 5 màn + shell + ChatPanel theo token MSB.
> Build/lint/test xanh (94/94). Code-review adversarial: đã fix 2 critical (freshness ẩn trên
> gradient → chuyển net worth sang card trắng; contrast tab active → `--color-primary-strong`),
> 3 warning (muted contrast `#5f6775`; bỏ chữ thường trên gradient; QuickActions dùng `next/link`).
> QA mobile thật trên thiết bị: chuyển sang Phase 07 (PFM-112).
>
> **Bổ sung (feedback user):** (1) sửa lỗi khung điện thoại — `PhoneShell` chuyển từ
> `min-h-screen` (co giãn theo content, nav trôi xuống đáy trang) → **khung cao cố định chuẩn
> iPhone 17 Pro Max (440×956pt)**: chỉ `<main>` cuộn nội bộ, nav pill ghim đáy khung; desktop
> có bezel + Dynamic Island. (2) Tăng độ giống app MSB: StatusBar có Dynamic Island; thẻ "Giá
> trị ròng" kiểu thẻ tài khoản MSB (mask số dư + nút eye ẩn/hiện). `--spacing-phone` 420→440.

## Ràng buộc
- File < 200 dòng, kebab-case/PascalCase theo hiện trạng. YAGNI/KISS/DRY.
- Chỉ presentation. Không sửa `src/domain`, `src/ai`, `src/providers`, `src/state` logic.
- Không import fixture trực tiếp ở component.

## Định nghĩa hoàn thành
- 5 màn + ChatPanel mang ngôn ngữ MSB (token mới), nav pill nổi 5 tab hoạt động đúng route.
- Hết lỗi layout mobile thật (số dài, wrap, touch target, safe-area).
- Không đổi kết quả tính toán/AI grounding; đủ 4 state; provenance còn nguyên.
- `build`/`lint`/`test` xanh.

## Next
→ Phase 07 polish states/motion/provenance trên token mới.
