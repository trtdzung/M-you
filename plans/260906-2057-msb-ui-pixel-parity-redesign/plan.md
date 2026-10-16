---
status: completed
type: implementation-plan
title: MSB UI pixel-parity redesign — clone app MSB thật + sắp xếp lại IA 3-tab
created: 2026-09-06
supersedes: 260903-1552-ai-native-facade-migration/phase-06-ux-overhaul-banking.md
blockedBy: []
blocks: []
refs:
  - ref-ui-msb/1.1 Home - Drop 1.png
  - ref-ui-msb/1.2 Home - Scrolling.png
  - plans/260903-1552-ai-native-facade-migration/reports/msb-design-tokens.md
---

# MSB UI pixel-parity redesign

Redesign toàn bộ UI/UX của **MSB Financial Copilot** để bám sát app MSB thật.
Màn **Trang chủ giống hệt** 2 ảnh ref (`ref-ui-msb/`); các màn còn lại dựng lại bằng
**ngôn ngữ thiết kế MSB** suy ra từ Home. Sắp xếp lại **toàn bộ feature** vào IA kiểu
MSB (3-tab), không còn 5-tab PFM.

> **Đảo chiều quyết định cũ.** Plan `260903-1552` (đã completed) Phase 06 chốt "giữ 5 tab +
> apply design language, không clone 1:1". Plan này thay thế hướng đó: **clone Home 1:1 + IA
> 3-tab**. Ràng buộc kiến trúc (CLAUDE.md) giữ nguyên tuyệt đối.

## Quyết định đã chốt (user sign-off 2026-09-06)

1. **Bottom nav = 3 tab** floating pill: **Trang chủ · Tài khoản · PFM**. Tab PFM thay vị trí
   Cài đặt. **Cài đặt** dời vào entry profile/gear ở header. Active = icon cam đặc + label cam
   trên pill peach, nền bar trắng.
2. **Trợ lý AI = FAB nổi** (hiện xuyên các màn) **+ 1 tile** trong grid quick-action. KHÔNG chiếm tab.
3. **Fidelity:** Home pixel-perfect (2 ảnh); màn khác theo design language MSB.

## Quyết định bổ sung sau red-team (2026-09-06)

4. **Settings entry (giải finding #6):** header giữ **pixel-parity** (chỉ logo + chuông, KHÔNG thêm gear để không lệch ref). Vào Cài đặt qua **account card** (chạm avatar/tên hạng → sheet hồ sơ & cài đặt). Consent-revocation phải reachable ≤2 chạm.
5. **On-scroll header (finding #4):** baseline = **Home tĩnh** khớp ảnh drop-state; hiệu ứng on-scroll (hiện search, thu account card) là **P2 optional**. Nếu làm: observer gắn vào ref của `<main>` (PhoneShell scroll nội bộ, KHÔNG dùng `window`).
6. **Redirect (finding #8):** route di dời (`/cashflow`,`/wealth`,`/consent`) → **thin Server Component gọi `redirect()` từ `next/navigation`** (bỏ `"use client"`). Định nghĩa 1 lần ở Phase 02, tái dùng.
7. **Transactions (finding #10):** `/transactions` **giữ nguyên** là view **tổng hợp mọi TK** (list + filter + CategoryEditor) — KHÔNG redirect. `/accounts/[id]` chỉ là view lọc theo 1 TK (tái dùng component). **BudgetList → PFM hub** (Dòng tiền). Hết triple-route.
8. **Promo % (finding #1):** card "ưu đãi 75%" = **banner tĩnh `source:mock`**, không số gắn dữ liệu người dùng; card insight thật tái dùng `InsightCard`.
9. **Atomic-ship gate (finding #5):** Phase 02–06 phải lên **cùng một đợt** (1 branch/flag). KHÔNG merge Phase 02 (đổi nav) lên `main` khi `/accounts` `/pfm` còn là placeholder.
10. **Demo disclosure (finding #15):** thêm chỉ báo **"Demo/Prototype"** cố định, tách khỏi chrome clone (chống dùng nhầm làm phishing template).

## Ánh xạ feature hiện có → IA MSB

| Feature cũ (route) | Đích trong IA MSB |
|---|---|
| Tổng quan (`/`) | **Trang chủ** — clone Home MSB (hero, account card, quick-action grid, carousel, FAB) |
| Giao dịch (`/transactions`) | Trong tab **Tài khoản** → account detail → danh sách giao dịch |
| Dòng tiền (`/cashflow`) | Trong tab **PFM** |
| Tài sản (`/wealth`) | Trong tab **PFM** |
| Giá trị ròng + Gợi ý (insights) | Trong tab **PFM** |
| Trợ lý (`/assistant`) | **FAB** + tile grid (route giữ, không phải tab) |
| Quyền dữ liệu (`/consent`) + Persona | **Cài đặt** (header gear) |
| Xác nhận chuyển tiền (`/transfer-confirm`) | Sub-flow từ draft handoff của Trợ lý, style MSB |

## Phases

| # | Phase file | Ưu tiên | Phụ thuộc | Status |
|---|---|---|---|---|
| 00 | [phase-00-data-model-prerequisites.md](phase-00-data-model-prerequisites.md) | P0 (blocker) | — | done |
| 01 | [phase-01-design-foundation-tokens.md](phase-01-design-foundation-tokens.md) | P0 | — | done |
| 02 | [phase-02-shell-nav-ia-rework.md](phase-02-shell-nav-ia-rework.md) | P0 | 01 | done |
| 03 | [phase-03-home-pixel-parity.md](phase-03-home-pixel-parity.md) | P0 | **00**, 01, 02 | done |
| 04 | [phase-04-accounts-tab.md](phase-04-accounts-tab.md) | P1 | 00, 02, 03 | done |
| 05 | [phase-05-pfm-hub-tab.md](phase-05-pfm-hub-tab.md) | P1 | 02, 03 | done |
| 06 | [phase-06-settings-assistant-transfer.md](phase-06-settings-assistant-transfer.md) | P1 | 02, 03 | done |
| 07 | [phase-07-states-motion-a11y-polish.md](phase-07-states-motion-a11y-polish.md) | P2 | 03–06 | done |

**All 8 phases complete (2026-09-06).** Verification: `next build` 0 errors (17 routes), `vitest` 148/148 passing (24 files), `next lint` 0 warnings/errors (re-verified during sync-back after clearing stale `.next` cache). M1 (00+01+03) and M2 (02+04+05+06) both landed; atomic-ship gate satisfied — no intermediate state where nav pointed at placeholders on `main`.

**Deviations from plan (accepted, non-blocking):**
- Phase 02 "Header gear → `/settings`" superseded by Red Team #6: header kept pixel-parity (logo + bell only); Settings entry moved to account-card tap-through (Phase 03/06), matching the plan's own later decision log.
- Phase 04 "`/transactions` cũ không gãy (redirect/gộp)" resolved as **no redirect** per Red Team #10: `/transactions` kept as the all-accounts consolidated view; `/accounts/[id]` reuses `TransactionListSection` filtered to one account.
- Phase 06 "`/consent` redirect/nhúng" resolved as **no redirect** per Red Team #2 (ConsentGate infinite-loop risk): `/consent` stays a real route for onboarding; `/settings` is the separate post-onboarding management surface.

## Dependency order

```
00 data-model ─┐
01 tokens ─────┴─► 02 shell/nav/IA ─► 03 Home pixel-parity ─┬─► 04 Accounts
                                                            ├─► 05 PFM hub
                                                            └─► 06 Settings/Assistant/Transfer
                                                                         │
                                                            03–06 ──► 07 polish/states/motion/a11y
```

> **Atomic-ship gate (finding #5):** Phase **02–06 lên cùng một đợt**. Không cho phép trạng thái
> trung gian nav trỏ vào placeholder trên `main`. Milestone-split được phép nội bộ (nhánh feature),
> nhưng chỉ hợp nhất khi mọi đích IA đã hoạt động.

## Milestones (chốt sau validate 2026-09-06)

**M1 — Home-parity (ship sớm, độc lập):** Phase **00 + 01 + 03**, KHÔNG đổi route topology.
- Home mới trông như MSB; nav bottom chỉ **restyle thị giác** (giữ route hiện có chạy ngầm).
- Grid/"Xem thêm"/FAB trỏ **tạm** vào route hiện có (`/transactions`, `/cashflow`, `/wealth`, `/assistant`).
- Merge lên `main` được ngay (Home đẹp + mọi feature cũ vẫn tới được). DEMO badge có ở M1.

**M2 — IA cutover (atomic, cùng đợt):** Phase **02 + 04 + 05 + 06**.
- Đổi nav 3-tab thật, tạo `/accounts` `/pfm` `/settings`, di dời cashflow/wealth/transactions/insights/consent.
- **Re-point** grid/"Xem thêm" của Home sang `/pfm`, `/accounts`.
- Chỉ merge khi mọi đích IA hoạt động (atomic gate).

**Polish:** Phase **07** chạy cuối mỗi milestone (Home polish cuối M1; toàn app cuối M2).

## Ràng buộc bất biến (mọi phase — KHÔNG phá, xem CLAUDE.md)

- Engine deterministic là **nguồn số duy nhất**; AI không commit tiền; không tự sinh số TK người nhận.
- UI chỉ đọc qua **provider interfaces** — không import fixture trực tiếp.
- Mọi số hiển thị kèm **period/source/freshness**; phân biệt `msb/self_reported/estimated/mock`.
- Missing ≠ 0 (giữ "unknown"); loại transfer nội bộ khỏi thu/chi; pending tách khỏi posted.
- Category taxonomy là **data**, không hard-code trong presentation.

## Ràng buộc kỹ thuật chung

- File < 200 dòng, kebab-case. YAGNI / KISS / DRY. Tokens đi qua `globals.css`, không rải hex.
- Component presentation-only, tách khỏi data hook. Tái dùng primitives sẵn có khi có thể.
- **Phủ empty / loading / error / insufficient-data** cho mọi màn (definition of done).
- A11y: touch target ≥44px, contrast AA, focus ring, `prefers-reduced-motion`, aria-label icon-only.
- Sau mỗi phase: `npm run lint` + `npm run build` sạch; test hiện có (125) vẫn xanh.

## Success criteria (toàn plan)

- Home dựng lại **khó phân biệt** với 2 ảnh ref (hero gradient/watermark, account card, grid 3x2,
  Rewards/Xem thêm, carousel dot, bottom nav 3-tab, FAB).
- Mọi feature PFM cũ vẫn truy cập được qua IA mới; không mất chức năng.
- Không vi phạm ràng buộc bất biến; test/lint/build xanh; a11y đạt checklist.

## Red Team Review

### Session — 2026-09-06
**Findings:** 15 (15 accepted, 0 rejected — 3 finding minor được fold/reject: component fragmentation, PfmHubNav pattern, PromoCard reuse)
**Severity breakdown:** 7 Critical, 4 High, 4 Medium
**Reviewers:** Security Adversary · Assumption Destroyer · Failure Mode Analyst · Scope & Complexity Critic

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Home 3 element headline không có field dữ liệu (tier/số TK/75%) → nguy cơ bịa số | Critical | Accept | **Phase 00 (mới)**, 03 |
| 2 | Consent-gate vòng lặp vô hạn khi `/consent`→`/settings` (PUBLIC_ROUTES) | Critical | Accept | Phase 06 |
| 3 | "Sắp phải trả" (obligations) bị rơi khỏi IA | Critical | Accept | Phase 03/05 |
| 4 | On-scroll header không kích hoạt (PhoneShell scroll `<main>`, không `window`) | Critical | Accept | Phase 03 (de-scope P2), 07 |
| 5 | Nav cutover ship IA gãy (tab trỏ placeholder trước 04–06) | Critical | Accept | plan (atomic gate), 02 |
| 6 | Xung đột gear (02) vs header pixel-parity (03) | Critical | Accept | plan (decision #4), 02, 03 |
| 7 | Regression gate mù: 125 test không phủ nav/route/page | Critical | Accept | Phase 07 (+DoD mỗi phase) |
| 8 | Cơ chế redirect chưa định nghĩa; page là `"use client"` | High | Accept | plan (decision #6), 02 |
| 9 | Reskin Assistant làm vỡ `ChatPanel.test.tsx` (chuỗi aria/copy) | High | Accept | Phase 06 |
| 10 | Transactions triple-route + BudgetList chưa chốt | High | Accept | plan (decision #7), 04, 05 |
| 11 | PII draft-transfer trong URL query param | High | Accept | Phase 06 |
| 12 | Scope: IA rework cạnh tranh ưu tiên AI facade | Medium | Partial | plan (milestone-split) |
| 13 | Pixel-parity bất khả kiểm + vỡ với text/persona động | Medium | Accept | Phase 03/07 |
| 14 | AI tile grid đã chốt nhưng Phase 03 để "optional" | Medium | Accept | Phase 03 |
| 15 | Clone giống hệt bank, không có chỉ báo Demo/Prototype | Medium | Accept | plan (decision #10), 01/07 |

## Validation Log

### Session 1 — 2026-09-06
**Trigger:** `/ck:plan validate` sau red-team; xác nhận các decision point còn mở.
**Questions asked:** 4

#### Questions & Answers
1. **[Scope]** Chia milestone thế nào (atomic gate vs thấy Home sớm)?
   - Options: M1 Home-parity trước / Một đợt 00–07 / 3-tab ngay từ đầu
   - **Answer:** **M1 Home-parity trước, M2 IA sau** — thấy kết quả sớm, rủi ro thấp.
2. **[Architecture]** Đặt lối vào Cài đặt (giữ header pixel-parity) ở đâu?
   - Options: Account card sheet / Avatar header / Tile grid-'Xem thêm'
   - **Answer:** **Chạm account card → sheet hồ sơ & cài đặt** (consent ≤2 chạm, header giữ parity).
3. **[Risk]** Dạng chỉ báo Demo/Prototype?
   - Options: Badge cố định kín đáo / Chỉ splash / Bỏ qua
   - **Answer:** **Badge 'DEMO' cố định, kín đáo** (luôn hiện, không phá layout).
4. **[Scope]** On-scroll header?
   - Options: Bỏ (Home tĩnh) / Làm, observer vào `<main>`
   - **Answer:** **Bỏ — Home tĩnh cho prototype.**

#### Confirmed decisions
- Milestone split M1 (00+01+03) → M2 (02+04+05+06); Phase 07 polish cuối mỗi milestone.
- Settings entry = account-card sheet (không gear header).
- DEMO badge cố định kín đáo (Phase 01, verify Phase 07).
- On-scroll: **loại khỏi scope** (Home tĩnh); gỡ nhánh "P2 optional" ở Phase 03.

#### Impact on phases
- **plan.md:** thêm Milestones (M1/M2).
- **Phase 01:** thêm DEMO badge component (cố định, kín đáo).
- **Phase 02:** đánh dấu thuộc M2; on-scroll gỡ khỏi Phase 07 verify.
- **Phase 03:** on-scroll **loại bỏ** (không còn P2 optional); Home tĩnh; grid trỏ tạm route cũ ở M1 rồi re-point ở M2.

**Recommendation:** Proceed → bắt đầu M1 từ Phase 00.
