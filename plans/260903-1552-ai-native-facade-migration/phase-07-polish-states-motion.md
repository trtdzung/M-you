# Phase 07 — Polish: states, motion, provenance UI, a11y (trên token MSB)

**Brainstorm:** Phase 3 · **Backlog:** PFM-112, PFM-090 · **Priority:** P2/P3 · **Status:** ✅ DONE (2026-09-04)

> Chạy sau Phase 06 (token/layout MSB thật, [reports/msb-design-tokens.md](reports/msb-design-tokens.md)).
> **Chỉ presentation/interaction.** Không đổi `src/domain`, `src/ai`, `src/providers`, `src/state` logic; không phá grounding; source chip không sinh số mới.

## Mục tiêu
Đưa toàn app đạt "definition of done": đủ 4 state (đã reskin token MSB), chuyển động nhẹ tôn trọng `prefers-reduced-motion`, provenance nhất quán, accessibility AA + touch target.

## Bối cảnh code (ground truth)
- `src/components/states/{Empty,ErrorState,InsufficientData,Loading}.tsx` **vẫn dùng token cũ**: `rounded-lg`, `border border-dashed border-border`, `bg-surface-muted`, `border-negative-soft bg-negative-soft/40`. Cần reskin sang card borderless `rounded-[24px]` + `shadow-card`, nền blush/peach, mực navy.
- `Loading.tsx` = spinner đơn thuần; **chưa có skeleton**. Plan yêu cầu skeleton shimmer nền peach.
- `globals.css` đã có token MSB + `@utility shadow-card/shadow-nav`, **chưa có keyframes/motion, chưa có `prefers-reduced-motion`**.
- Primitives provenance đã tồn tại: `SourceBadge` (pill `text-[10px]`), `Freshness` (relative theo `DEMO_NOW`). Tái dùng, không tạo mới.
- Chat: `SourceChips` render từ `UiMessage.chips`; streaming đã chunk (`chunkText`, 24 ký tự/đợt).

## Hạng mục & bước triển khai

### 1. States reskin (token MSB) — `src/components/states/*`
- **`Empty.tsx`**: bỏ `rounded-lg border border-dashed border-border bg-surface-muted` → `rounded-[24px] bg-surface-tint shadow-card` (peach borderless), title `text-text` (navy) `font-semibold`, desc `text-muted`. Icon giữ `text-muted`. Giữ nguyên API (`title/description/icon/action`).
- **`ErrorState.tsx`**: `rounded-lg border border-negative-soft bg-negative-soft/40` → `rounded-[24px] bg-negative-soft/60 shadow-card` (borderless), giữ `role="alert"`, icon `text-negative`.
- **`InsufficientData.tsx`**: `rounded-lg border border-warning-soft bg-warning-soft/40` → `rounded-[24px] bg-warning-soft/60 shadow-card` borderless, icon `text-warning`. Giữ phân biệt với Empty (data có nhưng coverage thấp).
- **`Loading.tsx`**: giữ spinner (thêm `role="status" aria-live="polite"` đã có). Không đổi API.

### 2. Skeleton primitive (mới) — `src/components/states/Skeleton.tsx` (+ export `index.ts`)
- Component `<Skeleton className w h rounded>` : nền `bg-surface-tint` + lớp shimmer chạy `--shimmer` gradient peach→trắng→peach.
- Thêm biến thể sẵn dùng: `SkeletonCard` (khối card `rounded-[24px] h-24`), `SkeletonRow` (dòng list `rounded-[16px] h-12`), `SkeletonText` (dòng chữ `h-3 rounded-full` width tuỳ biến).
- Dùng thay spinner ở nơi có layout ổn định (Overview cards, Transactions list, Wealth accordion) để giảm layout-shift; giữ `Loading` spinner cho vùng nhỏ/không xác định.
- Ẩn với screen reader (`aria-hidden`), kèm `role="status" aria-live="polite"` ở container + label ẩn "Đang tải…" (sr-only).

### 3. Motion nhẹ — `globals.css` + shell
- Thêm keyframes vào `globals.css`: `@keyframes shimmer { from{background-position:-150% 0} to{background-position:250% 0} }`; `@keyframes fade-in { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:none} }`.
- Utility: `@utility shimmer` (background 200% + animation 1.4s linear infinite), `@utility fade-in` (0.24s ease-out).
- **Reduced motion (bắt buộc)**: `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important } }`.
- Nav pill active: `BottomNav` thêm `transition-colors`/`transition-[background]` mượt khi đổi tab (không đổi logic route).
- Route change fade: bọc `{children}` trong `PhoneShell` `<main>` bằng `fade-in` theo `key={pathname}` (nếu shell là client) — nếu shell server, thêm class `fade-in` tĩnh cho `<main>`. Không lạm dụng, chỉ fade nội dung.
- Streaming: đã mượt; không đổi.

### 4. Provenance UI (PFM-090)
- Sweep 5 màn (`page.tsx`, `transactions`, `cashflow`, `wealth`, `assistant`) + component số liệu: mọi giá trị hiển thị phải kèm `SourceBadge` (source đúng: `msb/self_reported/estimated/mock`) và/hoặc `Freshness`. Không để số "trần".
- Chuẩn hoá spacing/size chip cho khớp token mới (badge cạnh số lớn: `ml-2 align-middle`); `SourceChips` trong chat khớp phong cách chung (cùng radius pill, cùng cỡ chữ).
- Nhắc lại bất biến: chip chỉ nhãn provenance, **không sinh số mới**.

### 5. A11y / responsive QA (PFM-112)
- **Contrast**: xác nhận `--color-muted #5f6775` trên blush & trắng ≥ AA; số/nhãn trên gradient nằm trên card trắng (đã xử ở P06) — rà lại chart legend.
- **Touch target ≥44px**: nav pill item, QuickActions ô, chevron `AccordionCard`, nút eye mask NetWorthCard, Composer send. Thêm padding/min-size nơi thiếu.
- **Keyboard + focus**: focus ring rõ (`focus-visible:ring-2 ring-primary/50`) cho nút/link/accordion; `AccordionCard` dùng `<button aria-expanded>`.
- **aria-label** cho nút icon-only (bell, search, eye, nav khi chỉ icon).
- **Charts (Recharts)**: `ChartFrame`/Category/IncomeExpense/NetWorthTrend có nhãn trục + màu đủ tương phản trên nền mới; thêm `aria-label`/title mô tả.

## Related code
**Modify:** `src/components/states/{Empty,ErrorState,InsufficientData,Loading}.tsx`, `src/components/states/index.ts`, `src/app/globals.css` (keyframes + reduced-motion + utilities), `src/components/shell/{BottomNav,PhoneShell}.tsx` (transition + route fade + touch target), `src/components/common/{AccordionCard,QuickActions}.tsx` (a11y/touch), `src/components/wealth/NetWorthCard.tsx` (eye button a11y), `src/components/charts/*` (labels/contrast/aria), `src/components/assistant/SourceChips.tsx` (spacing khớp). Sweep 5 `page.tsx`/màn cho provenance & skeleton.
**Create:** `src/components/states/Skeleton.tsx`.

## Ràng buộc
- File < 200 dòng, kebab-case/PascalCase. YAGNI/KISS/DRY. Chỉ presentation — không sửa engine/AI/provider/state.
- Không import fixture trực tiếp ở component. Mọi số kèm period/source/freshness.

## Todo
- [x] 1. Reskin 4 state component sang token MSB (borderless card + shadow)
- [x] 2. Skeleton primitive + biến thể; áp vào Overview/Transactions/Wealth loading
- [x] 3. Motion: keyframes shimmer/fade + `prefers-reduced-motion` + nav/route transition
- [x] 4. Provenance sweep 5 màn + chat chip nhất quán
- [x] 5. A11y/responsive: contrast, touch ≥44px, focus, aria, chart labels
- [x] 6. `npm run build` + `lint` + `test` xanh (không đỏ test cũ); code-review + fix

## Hoàn thành (2026-09-04)
Đã reskin 4 state component (`Empty`/`ErrorState`/`InsufficientData`/`Loading`) sang card borderless MSB; thêm primitive `Skeleton` (shimmer) mới. Thêm motion utilities trong `globals.css` (keyframes shimmer/fade-in) kèm `prefers-reduced-motion` bắt buộc. Provenance sweep: `Freshness` bổ sung trên các cashflow aggregate; `SourceBadge` hiện có được giữ nguyên — **không** fabricate một badge nguồn đơn trên aggregate đa nguồn (đúng bất biến #5). A11y: touch target ≥44px, focus-visible ring, chart shimmer khi loading. `npm run build`/`lint`/`test` xanh (125 test pass, lint 0/0, build 0 lỗi).

## Định nghĩa hoàn thành
- Mọi feature phủ đủ 4 state (đã reskin token mới); skeleton thay spinner nơi có layout ổn định.
- Motion nhẹ, tôn trọng `prefers-reduced-motion`.
- Provenance nhất quán toàn app (badge + freshness), chat chip khớp phong cách.
- Pass checklist a11y/responsive (PFM-112): contrast AA, touch ≥44px, keyboard/focus, aria, chart labels.
- `build`/`lint`/`test` xanh.

## Next
→ Phase 08 assisted transfer drafting (Level 3 gate).
