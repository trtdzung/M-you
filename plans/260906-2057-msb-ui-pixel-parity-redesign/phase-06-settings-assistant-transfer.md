# Phase 06 — Cài đặt (header), Trợ lý AI (FAB) & Xác nhận chuyển tiền

**Context links:** [plan.md](plan.md) · phase-02 (gear+FAB), phase-03 (Home) · CLAUDE.md (bất biến AI/tiền)

## Overview
- **Priority:** P1
- **Status:** done
- Hoàn thiện 3 luồng còn lại theo IA/visual MSB: **Cài đặt** (từ header gear: Quyền dữ liệu + Persona), **Trợ lý AI** (màn chat mở từ FAB, restyle MSB), **Xác nhận chuyển tiền** (sub-flow từ draft handoff).

## Key insights
- Consent (`/consent`) + PersonaSwitcher đang rời rạc → gom vào `/settings` (từ gear header).
- Assistant (`/assistant`) đã có pipeline thật (ChatPanel, Composer, DraftCard, WhatIfChart, streaming) — **chỉ reskin vỏ** + entry qua FAB, KHÔNG đổi logic/pipeline/an toàn.
- Transfer-confirm (`/transfer-confirm` + `TransferConfirm.tsx`) là màn review draft — **giữ nguyên ràng buộc bất biến**: AI không commit; user review từng field, confirm ở luồng MSB, tự OTP; không bịa số TK người nhận. Chỉ restyle theo MSB.

## Requirements
- **FR:** `/settings` gom Quyền dữ liệu (consent toggle theo scope) + Persona switcher + info app; Assistant mở từ FAB, vỏ MSB; Transfer-confirm hiển thị đủ field draft + nút confirm dẫn tới luồng xác thực (mock) đúng chuẩn "human executes".
- **NFR:** provenance; empty/loading/error; a11y (focus, aria); reduced-motion cho streaming/animation.
- **Bất biến (BẮT BUỘC):** AI non-committing; không tự chuyển tiền; không sinh/bịa số TK người nhận (chỉ từ beneficiary/nhập tay/lịch sử); draft trên ngưỡng cần re-confirm trong chat; AI không xử lý OTP/credential.

## Architecture
- `/settings`: gom `ConsentGate`/consent state + `PersonaSwitcher`; card list kiểu MSB (icon + label + chevron/toggle).
- Assistant: giữ `ChatPanel`/`Composer`/`DraftCard`/`SourceChips`/`WhatIfChart`; đổi header + màu + bubble theo token MSB; FAB (phase-02) là entry chính; ẩn FAB khi ở màn này.
- Transfer-confirm: reskin `TransferConfirm.tsx` (card field, số tiền lớn, source account, memo, cảnh báo an toàn, nút "Xác nhận & xác thực" mock). Giữ nguyên guard/validation.

## Related code files
- **Create:** `src/app/settings/page.tsx` (thay placeholder phase-02)
- **Modify:** `src/app/consent/page.tsx` (nhúng vào settings hoặc redirect), `src/components/persona/PersonaSwitcher.tsx` (vỏ), `src/app/assistant/page.tsx` + `src/components/assistant/*` (chỉ style), `src/app/transfer-confirm/TransferConfirm.tsx` + `page.tsx` (style, giữ logic)
- **Read:** `src/lib/consent.ts`, `src/state/context.tsx`, `src/insights/assistant-stream.ts`, CLAUDE.md invariants

## Implementation steps
1. `/settings`: dựng list card MSB — mục "Quyền dữ liệu" (consent theo scope), "Hồ sơ/Persona" (PersonaSwitcher), "Về ứng dụng". Consent giữ logic `lib/consent.ts`.
2. Redirect/nhúng `/consent` → `/settings` (giữ deep-link).
3. Assistant reskin: header MSB (title + back), bubble user/assistant theo token, DraftCard/SourceChips/WhatIfChart giữ chức năng; ẩn FAB khi ở đây.
4. Transfer-confirm reskin: card review field rõ ràng, số tiền lớn, nhãn nguồn/beneficiary, banner an toàn ("AI chỉ chuẩn bị — bạn xác nhận & xác thực"); nút confirm dẫn bước xác thực mock. **Không** thêm auto-submit.
5. Rà soát guard bất biến còn nguyên (grep các chặn: no-commit, no-OTP, threshold re-confirm).
6. Phủ empty/loading/error; reduced-motion cho streaming.

## Todo
- [x] `/settings` gom consent (scope view + revoke) + persona (giữ `lib/consent.ts` logic)
- [x] `/consent` — giữ nguyên là route thật (không redirect), để tránh vòng lặp ConsentGate (Red Team #2); `/settings` là đích riêng cho quản lý sau onboarding
- [x] Assistant reskin vỏ (logic/pipeline nguyên vẹn), FAB ẩn khi ở `/assistant`
- [x] Transfer-confirm reskin, giữ toàn bộ guard an toàn — PII chuyển khỏi URL sang `transfer-draft-store.ts` (sessionStorage, chỉ truyền `draftId`) theo Red Team #11
- [x] Xác minh bất biến AI/tiền không bị phá (grep + đọc; không commit/OTP/bịa số TK)
- [x] States đầy đủ; test assistant/safety cũ vẫn xanh (148 test); lint/build xanh

## Success criteria
- Cài đặt truy cập từ header gear, chỉnh consent + persona hoạt động.
- Assistant mở từ FAB, giao diện MSB, mọi số vẫn grounded (validator/pipeline nguyên).
- Transfer-confirm đúng "agent prepares, human executes" — không có đường tự chuyển tiền.

## Risk & mitigation
- *Reskin vô tình phá guard an toàn:* chỉ đụng class/markup; chạy safety tests sau khi sửa; review diff logic = 0.
- *Consent state lệch scope:* giữ nguyên `lib/consent.ts`, chỉ đổi trình bày.

## Security (trọng yếu)
- Bảo toàn: AI không commit/không OTP/không bịa số TK; re-confirm theo ngưỡng; audit event AI giữ nguyên. Đây là ràng buộc pháp lý/sản phẩm — kiểm tra kỹ trong review.

## Red Team fixes (2026-09-06)
- **[#2 consent-gate — CRITICAL]** `ConsentGate.tsx` hard-code `PUBLIC_ROUTES = {"/onboarding","/consent"}`. Nếu `/consent`→`/settings` mà không cập nhật allowlist → **user mới vòng lặp vô hạn**, không thể cấp consent. Bắt buộc: thêm `ConsentGate.tsx` vào Related files; hoặc **giữ `/consent` là route thật** (chỉ redirect sau khi đã consent) hoặc thêm `/settings` vào allowlist; thêm **regression test** phiên mới: onboarding→consent→app chạy được. Entry Cài đặt từ account card (không phá luồng onboarding→`/consent`).
- **[#9 ChatPanel test]** Giữ NGUYÊN chuỗi test-facing khi reskin: placeholder `/Hỏi bất kỳ điều gì/i`, `aria-label="Gửi"`, starter `"Giải thích tháng này"`, text `/1 nguồn dữ liệu/` — hoặc cập nhật `ChatPanel.test.tsx` trong cùng change. Chỉ đụng class/markup.
- **[#11 PII draft trong URL]** `DraftCard.confirmHref()` đang nhét `name/amount/memo/src` vào query param. Chuyển sang **router/in-memory state hoặc server draft-id** tra ở `/transfer-confirm`. Thêm "không PII trong URL" vào checklist an toàn.
- **[#6 Settings discoverability]** Consent-revocation (PFM-094) reachable ≤2 chạm từ account card → Cài đặt; thêm tiêu chí a11y/UX (verify ở Phase 07).
- **[#8 redirect]** `/consent` xử lý theo cơ chế chốt ở Phase 02 (server-component redirect) — nhưng lưu ý ràng buộc #2 (không phá luồng consent lần đầu).
- **[bất biến]** Reskin Assistant/Transfer **chỉ markup/class**; chạy safety tests + `ChatPanel` test sau khi sửa; diff logic = 0.

## Next steps
→ Phase 07 polish states/motion/a11y toàn app + regression.
