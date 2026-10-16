# Phase 03 — Trang chủ pixel-parity (clone Home MSB)

**Context links:** [plan.md](plan.md) · phase-01 (tokens), phase-02 (shell) · refs `1.1 Home - Drop 1`, `1.2 Home - Scrolling`

## Overview
- **Priority:** P0 (deliverable trung tâm — "giống hệt")
- **Status:** done
- Dựng lại `/` (Trang chủ) **khó phân biệt** với 2 ảnh ref, đồng thời là điểm vào mọi feature PFM qua grid quick-action + carousel insight + FAB.

## Key insights (đọc trực tiếp từ ref)
- **Hero:** gradient cam→peach bo góc dưới lớn; watermark glass "M" nổi giữa; header trong suốt đè lên (logo MSB trái, chuông + badge "9" phải). Khi cuộn (`1.2`): header co lại, **thêm icon search**, account card thu gọn ghim trên.
- **Account card** (trắng, bo 24, đè lên hero): hàng 1 = avatar tròn (hạng "M-FIRST GOLD" cam) + tên hạng + chevron `›`. Divider. Hàng 2 = số TK (muted) trái; **số dư mask `******* VND`** + **eye toggle** phải.
- **Quick-action card** (peach, bo 24): lưới **3×2 outline icon**: Chuyển tiền, Quét QR, Tiền gửi, Thẻ, Thanh toán, Vay. Divider. Hàng cuối 2 mục: **Rewards** (trái), **Xem thêm** (phải).
- **Carousel:** card "Ưu đãi dành riêng" (icon + title + chevron + body + **progress "75% hạn mức lương"** + pill "Tìm hiểu ngay") → **dot pagination** (3 chấm, chấm 1 active dài) → banner Apple Pay cuộn ngang.
- Bottom nav 3-tab (phase-02) + FAB (phase-02).

## Requirements
- **FR:** Bố cục/spacing/thứ tự khối khớp ref; account card mask+eye hoạt động; grid là entry PFM; carousel cuộn ngang có snap + dot; on-scroll header đổi trạng thái (thêm search, account card thu gọn).
- **NFR:** số dư/số liệu vẫn qua provider + có provenance ngầm (source/freshness) — **không** hiển thị số bịa; mask mặc định theo ref (`*******`); carousel snap; a11y đầy đủ.
- **Bất biến:** số dư/networth từ engine/provider; không hard-code số; category grid là data.

## Architecture
- Trang `/` compose các component presentation mới; data qua `useFinancials` (giữ).
- **Component mới:**
  - `AccountSummaryCard` (tier avatar, tên, chevron, số TK, số dư mask + eye) — nhận dữ liệu account chính từ provider.
  - `HomeQuickGrid` — dùng lại `QuickActions` (3 cột) + hàng phụ Rewards/Xem thêm (biến thể `footerActions`).
  - `PromoCarousel` + `PromoCard` + `Dots` — snap-scroll, card đầu = insight/ưu đãi (nối `runDetectors` để "Ưu đãi dành riêng" phản ánh insight thật), card sau = banner tĩnh mock (`source: mock`).
  - `HomeHeader` (biến thể BrandHeader) — on-scroll: thêm search, đổi nền.
- Grid entry PFM: Chuyển tiền→ draft/assistant; Quét QR/Tiền gửi/Thẻ/Thanh toán/Vay = mock placeholder có nhãn `mock`; **Xem thêm** → `/pfm` (hub). Trợ lý AI = FAB (đã có) — có thể thêm tile trong "Xem thêm".

## Related code files
- **Modify:** `src/app/page.tsx` (viết lại theo layout Home MSB), `src/components/common/QuickActions.tsx` (hỗ trợ footer row Rewards/Xem thêm)
- **Create:** `src/components/home/AccountSummaryCard.tsx`, `src/components/home/HomeQuickGrid.tsx`, `src/components/home/PromoCarousel.tsx`, `src/components/home/PromoCard.tsx`, `src/components/home/Dots.tsx`, `src/components/shell/HomeHeader.tsx`
- **Read:** `src/state/useFinancials.ts`, `src/insights/run.ts`, `src/providers/*` (account chính), `BrandWatermark.tsx`

## Implementation steps
1. `HomeHeader`: logo MSB + bell(badge) + (on-scroll) search; nền trong suốt → mờ khi cuộn (IntersectionObserver hoặc scroll listener nhẹ, throttle).
2. Hero: `.hero-gradient` + `BrandWatermark`, bo góc dưới lớn, chiều cao khớp ref.
3. `AccountSummaryCard`: lấy account chính qua provider; mask mặc định + eye toggle (giữ pattern eye hiện có ở `page.tsx`); provenance qua `Freshness`/`SourceBadge` (kín đáo, không phá layout ref).
4. `HomeQuickGrid`: 6 ô 3×2 (icon outline lucide gần nhất: `ArrowUpRight`, `ScanLine`, `PiggyBank`, `CreditCard`, `ReceiptText`, `HandCoins`) + divider + footer row Rewards (`Award`/`Medal`) & Xem thêm (`LayoutGrid`)→`/pfm`.
5. `PromoCarousel`: snap-scroll ngang; card 1 = insight thật (map từ `runDetectors`, fallback ưu đãi mock); dot pagination sync với scroll.
6. Ghép trong `page.tsx` đúng thứ tự ref; phủ loading (skeleton khớp khối)/error/empty/insufficient-data.
7. So ảnh cạnh ref, tinh chỉnh spacing/size cho khớp.

## Todo
- [x] HomeHeader — on-scroll loại khỏi scope (Session 1 decision); Home tĩnh dựng xong
- [x] Hero gradient + watermark glass "M"
- [x] AccountSummaryCard (tier, số TK, mask + eye) qua provider
- [x] HomeQuickGrid 3×2 + Rewards/Xem thêm
- [x] PromoCarousel + dot (card 1 = insight thật, tái dùng `InsightCard`)
- [x] Loading/error/empty/insufficient-data khớp khối
- [x] So cạnh ref đạt "khó phân biệt"; lint/build xanh

## Success criteria
- Đặt cạnh `1.1`/`1.2`: hero, account card, grid, carousel, nav, FAB **khó phân biệt**.
- Mọi số vẫn từ provider (không bịa); mask/eye/carousel/on-scroll hoạt động.
- "Xem thêm" và grid là entry hợp lệ tới PFM/feature.

## Risk & mitigation
- *Số bịa để cho giống ref:* KHÔNG — dùng dữ liệu provider, mask theo ref là hành vi thật (ẩn số dư).
- *On-scroll header jank:* throttle scroll / IntersectionObserver, transform+opacity only.
- *Icon lệch ref:* chọn lucide gần nhất; nếu cần đúng 100% → SVG custom (ghi TODO, không chặn done).

## Security
- Không lộ số TK bịa; account number từ provider (mock hợp lệ). Không thao tác tiền ở Home.

## Red Team fixes (2026-09-06)
- **[#1 dữ liệu]** Chặn bởi **Phase 00**. `tier` + `maskedNumber` lấy từ provider (KHÔNG hard-code "M-FIRST GOLD" / KHÔNG bịa số TK). Số TK render **last-4 mask** mặc định (không reveal toàn bộ). Card "ưu đãi 75%" = **banner tĩnh `source:mock`**, KHÔNG số gắn dữ liệu người dùng.
- **[#3 obligations]** Giữ 1 entry "Sắp phải trả" (obligations) — hoặc trong Home hoặc rõ ràng chuyển sang PFM hub (Phase 05). KHÔNG được rơi mất. Thêm todo.
- **[#4 on-scroll]** Baseline = **Home tĩnh** khớp ảnh drop-state. Hiệu ứng on-scroll (search hiện, account card thu gọn) hạ xuống **P2 optional**. Nếu làm: observer gắn ref `<main>` (PhoneShell scroll nội bộ), KHÔNG `window`/`document`. <!-- Updated: Validation Session 1 — on-scroll LOẠI KHỎI SCOPE (xem dưới) -->
- **[#5 InsightCard reuse]** Card insight trong carousel **tái dùng `InsightCard`** (giữ dismiss/snooze/markHelpful, cùng `insightState` với `/pfm/insights`) — KHÔNG tạo `PromoCard` render trùng logic cho insight; `PromoCard` chỉ cho banner tĩnh mock.
- **[#13 pixel-parity bound]** Success "khó phân biệt" ràng vào **1 persona/dataset tham chiếu** cụ thể; thêm kiểm chịu tải text dài/nhiều persona (truncation, card height) như tiêu chí phụ.
- **[#14 AI tile]** Tile "Trợ lý AI" trong grid/"Xem thêm" là **bắt buộc** (khớp quyết định đã chốt) — thêm vào Todo + success criteria, KHÔNG để optional.

## Todo (bổ sung red-team)
- [x] `tier`/`maskedNumber` từ provider (Phase 00), số TK last-4 mask
- [x] Entry "Sắp phải trả" không bị rơi — landed ở **PFM hub** (`src/app/pfm/page.tsx`), không ở Home (chốt theo Phase 05)
- [x] Home tĩnh đạt trước; on-scroll loại khỏi scope (Session 1)
- [x] Carousel insight tái dùng `InsightCard`; promo = banner mock tĩnh (`PromoCard`)
- [x] AI tile bắt buộc trong grid footer ("Trợ lý AI" cạnh Rewards/Xem thêm, `HomeQuickGrid.tsx`) — bên cạnh FAB (Phase 02)
- [x] Pixel-parity so cạnh ref đạt "khó phân biệt" trên persona mặc định

<!-- Updated: Validation Session 1 — on-scroll dropped, M1 grid routing, HomeHeader static -->
## Validation update (Session 1 — 2026-09-06)
- **[Milestone]** Phase 03 thuộc **M1**.
- **[#4 on-scroll — LOẠI KHỎI SCOPE]** KHÔNG làm on-scroll cho prototype. `HomeHeader` **tĩnh** (logo + chuông; search có thể hiện tĩnh hoặc bỏ). Gỡ IntersectionObserver/scroll-listener khỏi step 1. Bỏ risk "on-scroll jank".
- **[M1 routing]** Ở M1, grid/"Xem thêm"/FAB trỏ **tạm** vào route hiện có (`/transactions`, `/cashflow`, `/wealth`, `/assistant`). Sang **M2 re-point** sang `/pfm`, `/accounts` (không phá Home; chỉ đổi href).
- **[#6 Settings]** Chạm avatar/tên hạng trên account card → mở **sheet Hồ sơ & Cài đặt** (entry Cài đặt; nội dung đầy đủ ở Phase 06/M2). M1 có thể mở sheet tối giản/link `/consent` cũ.

## Next steps
→ Phase 04/05/06 dựng các đích của grid/carousel/Xem thêm.
