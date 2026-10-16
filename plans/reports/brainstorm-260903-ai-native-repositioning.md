# Brainstorm — Repositioning MSB PFM: từ "web report tĩnh" → "feature AI-native in-app"

**Date:** 2026-09-03 · **Type:** Brainstorm summary · **Status:** Agreed, chờ /ck:plan

## 1. Problem statement

MVP hiện tại bị sai định vị: là *web report tĩnh đội lốt điện thoại*, không phải *feature AI sống trong app MSB*. Xác nhận qua code:

- **AI giả**: `src/insights/assistant.ts` = `switch-case` 3 nút cứng → text template. Không LLM, không free-text, không hội thoại.
- **Phone-frame giả**: `PhoneShell.tsx` chỉ là cột `max-w-phone` (420px) căn giữa trên desktop.
- **UI generic**: Tailwind card, đỏ MSB + Inter — "vibe app tự sinh", không mang design language MSB thật.
- **Toàn dashboard tĩnh**: net worth / cashflow / category bars / rule-based insights. Lỗi format mobile thật.

## 2. Ràng buộc bất biến (CLAUDE.md — không phá)

Engine deterministic = nguồn số liệu duy nhất · AI read-only facade · không tự chuyển tiền · mọi số có provenance (`msb`/`self_reported`/`estimated`/`mock`) · missing ≠ 0 · category là data. → "AI wow" đạt *trong* ràng buộc; chính ràng buộc tạo **niềm tin** = wow thật của app ngân hàng.

## 3. Quyết định (từ discovery)

| Câu hỏi | Chốt |
|---|---|
| Đối tượng MVP | Sản phẩm thật hướng người dùng cuối |
| LLM thật? | **Được** — dùng LLM thật (vd Claude API) |
| Design ref MSB | **Có** screenshots/app MSB thật (user cung cấp) |
| Ưu tiên #1 | **AI trở nên thật & nổi trội** |
| Phạm vi AI Phase 1 | **Chat grounded + What-if + Chủ động** (đầy đủ) |
| Lỗi mobile | Gộp vào Phase 2 (fix tận gốc khi đại tu UX) |

## 4. Approaches đã cân nhắc

- **A — LLM chỉ diễn đạt lại (thin)**: rẻ/an toàn nhưng scripted, không free-text, không nổi trội. ❌ Loại.
- **B — Trợ lý tool-calling grounded ✅ CHỌN**: chat free-text; LLM có bộ tool read-only nối engine deterministic; pipeline intent→consent/scope→required-data→tool→narrate(stream)→validate số→answer + source chips + card tương tác. Đúng y `ARCHITECTURE.md`. `switch-case` cũ tái dùng làm formatter + fallback offline.
- **C — Full agent (memory + đa lượt phức tạp)**: over-engineer/YAGNI, khó demo ổn định. ⏸ Defer.

## 5. Giải pháp chốt — Hướng B, 3 signature moves

1. **Chat free-text + streaming** thay 3 nút cứng.
2. **What-if tương tác**: vd "để dành 5tr/tháng bao giờ đủ 200tr?" → `simulateGoal` → LLM giải thích + mini chart phóng chiếu trong bong bóng chat. Read-only, deterministic.
3. **Niềm tin nhìn thấy được**: mỗi số kèm chip nguồn/kỳ; validator chặn mọi số không khớp tool-result.
4. **Chủ động (Phase 1)**: tái dùng detectors (`budgetPressure`, `spendingSpike`, `incomeChange`, `newRecurring`, `upcomingObligation`) → đẩy gợi ý vào hội thoại/mở đầu chat, bounded.

## 6. Sequencing

- **Phase 1 — AI facade thật (ưu tiên #1)**: API route chạy pipeline tool-calling LLM thật + tool layer bọc engine + UI chat streaming + numeric/schema validator + source chips + simulations (goal, budget) + proactive từ detectors. *Không cần screenshot MSB.*
- **Phase 2 — Đại tu UX chuẩn banking**: dựng lại shell + màn hình bám screenshot MSB thật; fix lỗi format mobile tận gốc.
- **Phase 3 — Polish**: empty/loading/error/insufficient-data states, motion, hoàn thiện provenance UI.
- **Phase 4 — Assisted transfer drafting (Level 3, gated sau Phase 1–2)**: agent *soạn* lệnh chuyển khoản, con người *thực thi* + OTP. Xem §10.

## 10. Mở rộng scope: Assisted transfer drafting (Level 3)

**Yêu cầu:** agent có thể tạo giao dịch chuyển khoản (điền số tiền, người nhận, nội dung...), con người ấn nút + tự nhập OTP.

**Nguyên tắc:** *write-intent, không phải write.* Agent chuyển từ read-only facade → **read + draft-only facade**. Không phá invariant — làm rõ ranh giới draft vs execute.

| Agent ĐƯỢC | Agent KHÔNG BAO GIỜ |
|---|---|
| Tạo `TransferDraft` (người nhận, số tiền, memo, TK nguồn) | Thực thi / xác nhận / submit / lên lịch |
| Lấy người nhận từ beneficiary đã lưu + user gõ + lịch sử GD (số TK thật) | Xử lý/hỏi/bypass OTP, mật khẩu |
| Hỏi lại khi mơ hồ; cảnh báo khi vượt ngưỡng | Bịa/hoàn thiện số tài khoản người nhận |
| Bàn giao draft vào màn MSB gốc (field sửa được) | Chuyển tiền khi con người chưa duyệt + xác thực |

**Quyết định guardrail (đã chốt):**
- Nguồn người nhận: beneficiary đã lưu + user gõ + **suy luận từ lịch sử GD** (số TK từ bản ghi thật, không bịa, user xác nhận).
- Số tiền: **ngưỡng cảnh báo** — trên mức X → agent yêu cầu xác nhận lại trong chat trước khi tạo nháp.
- **Fraud checkpoint** (điểm mạnh niềm tin): draft có (người nhận mới + số lớn + ngôn ngữ khẩn cấp) → cảnh báo, yêu cầu re-confirm. Biến agent thành *chốt chống lừa đảo* thay vì vector tấn công.
- Chỉ chuyển khoản (scope hiện tại); tool tier thiết kế mở rộng được.

**Docs đã cập nhật:** `CLAUDE.md` (invariants #2/#3), `docs/PRODUCT.md` (contract + Level 3 + risks/metrics), `docs/ARCHITECTURE.md` (2 tool tiers, `TransferDraft`, action pipeline, security), `plans/project-backlog.md` (EPIC-13: PFM-130..134, PFM-093 nâng P0, Level 3 gate).

**Rủi ro chính:** prompt-injection/social-engineering vào draft → chặn bằng: không bịa số TK, ngưỡng, fraud checkpoint, agent không thực thi/không chạm OTP, audit đầy đủ, safety tests (PFM-092).

## 7. Rủi ro & giảm thiểu

- **Hallucination số** → numeric validator bắt buộc: số nào không trace tool-result thì chặn/hỏi lại. Test guardrail.
- **Latency/độ ổn định demo** → streaming + fallback offline (dùng answer template cũ) khi LLM lỗi/mất mạng.
- **Chi phí LLM / lộ key** → gọi qua API route server-side, không expose key client; cân nhắc cache theo intent.
- **Scope creep (proactive)** → giới hạn detectors hiện có, không thêm autonomy ngoài read-only.
- **Consent/scope** → tôn trọng `ConsentGate`/`lib/consent.ts` trong required-data check.

## 8. Success metrics

- Free-text hỏi bất kỳ về cashflow/networth/category/obligation → trả lời grounded, có nguồn.
- 100% số hiển thị trace được về tool-result (validator pass).
- ≥2 what-if simulation có chart trong chat.
- AI fallback chạy offline khi LLM lỗi.
- (Phase 2) UI khớp screenshot MSB; hết lỗi layout trên mobile thật.

## 9. Next steps

- Chạy `/ck:plan` để tạo kế hoạch phased chi tiết từ report này.
- User cung cấp: screenshots app MSB (Phase 2) + mô tả/ảnh lỗi mobile cụ thể.
- Xác nhận LLM provider + nơi lưu API key (env server-side).
