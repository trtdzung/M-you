# Phase 08 — Assisted transfer drafting (Level 3): agent soạn, người thực thi

**Brainstorm:** Phase 4 · **Backlog:** EPIC-13 (PFM-130..134), PFM-093, PFM-092 · **Priority:** P1 (Level 3) · **Status:** OUTLINE — gated

> **Gate:** chỉ mở sau khi Phase 03 (tool/pipeline/validator) ổn định + Level 3 release gate (backlog). Phụ thuộc EPIC-03 (transactions), EPIC-08 (assistant+tools), PFM-093 (action boundary). **Không draft flow nào bypass PFM-093.**

## Nguyên tắc bất biến (CLAUDE.md #2/#3)

*write-intent, không phải write.* Agent: read-only facade → **read + draft-only facade**. Agent tạo `TransferDraft`, **không bao giờ** thực thi/xác nhận/submit/chạm OTP, **không bịa số TK**. Con người duyệt từng field + tự xác thực trong luồng MSB gốc.

| Agent ĐƯỢC | Agent KHÔNG BAO GIỜ |
|---|---|
| Tạo `TransferDraft` (người nhận, số tiền, memo, TK nguồn) | Thực thi/xác nhận/submit/lên lịch |
| Lấy người nhận từ beneficiary lưu + user gõ + lịch sử GD (số TK thật) | Xử lý/hỏi/bypass OTP, mật khẩu |
| Hỏi lại khi mơ hồ; cảnh báo khi vượt ngưỡng | Bịa/hoàn thiện số TK |

## Hạng mục (EPIC-13)

1. **`TransferDraft` model (PFM-131)**: thêm vào `src/domain/models/index.ts` theo shape ARCHITECTURE §TransferDraft (status luôn `draft`, `recipientSource`, `riskFlags`, `thresholdHit`, `requiresReconfirm`). Không field OTP/credential/execution token.
2. **`findRecipient` (Tier A, PFM-130)**: resolve người nhận từ saved beneficiaries + user input + lịch sử GD; chỉ trả reference thật, mask hiển thị; mơ hồ → hỏi lại. Không bịa số.
3. **`prepareTransferDraft` (Tier B, PFM-131)**: build `TransferDraft` đã validate + handoff descriptor. **Không có code path** execute/submit/confirm/authenticate. Thiếu field → hỏi, không bịa.
4. **Threshold re-confirm (PFM-132)**: trên ngưỡng cấu hình → yêu cầu re-confirm trong chat trước khi tạo draft; set `thresholdHit`/`requiresReconfirm`.
5. **Fraud checkpoint (PFM-133)**: (payee mới + số lớn + ngôn ngữ khẩn cấp) → `riskFlags[]` + cảnh báo slow-down; cảnh báo nhưng không chặn quyết định hợp lệ sau re-confirm.
6. **Native MSB handoff mock (PFM-134)**: màn confirm mock — field editable, confirm tường minh, OTP mô phỏng do người dùng thao tác; agent không auto-fill/auto-submit; huỷ/sửa trả control không side effect. GD (mock) kết quả `source: mock`, tách khỏi draft.
7. **Action boundary (PFM-093)** + **safety tests (PFM-092)**: facade không có path execute/confirm/OTP; test injection đòi thực thi/bịa số/bypass ngưỡng/tắt fraud checkpoint đều bị chặn + audit.

## Pipeline (ARCHITECTURE §Action pipeline)

```
intent(action) → consent action-tier → findRecipient (không bịa)
→ gom+validate field → risk (threshold + fraud) → nếu rủi ro: re-confirm in-chat
→ prepareTransferDraft (Tier B) → render draft editable + provenance
→ handoff màn MSB mock → HUMAN confirm + OTP → (mock) execute ngoài facade → audit
```

## Related code (sẽ chi tiết khi mở gate)

- Modify: `src/domain/models/index.ts` (TransferDraft), `src/ai/tools/registry.ts` (Tier B tách riêng), `src/ai/pipeline/*` (action branch), `src/ai/pipeline/intent.ts` (action intent bật).
- Create: `src/ai/tools/draft-tools.ts`, `src/ai/pipeline/action-pipeline.ts`, màn confirm mock `src/app/transfer-confirm/*`, safety tests draft-attack.

## Định nghĩa hoàn thành (Level 3 gate — backlog)

- Không autonomous action: agent chỉ ra draft review được.
- Draft không chứa số TK bịa; execute/confirm/OTP chỉ do người trong luồng MSB.
- Threshold re-confirm + fraud checkpoint fire đúng, có safety test.
- PFM-093 boundary: không path execute/confirm/authenticate trong facade.

## Rủi ro chính

Prompt-injection/social-engineering vào draft → chặn bằng: không bịa số TK, ngưỡng, fraud checkpoint, agent không thực thi/không chạm OTP, audit đầy đủ, safety tests (PFM-092).
