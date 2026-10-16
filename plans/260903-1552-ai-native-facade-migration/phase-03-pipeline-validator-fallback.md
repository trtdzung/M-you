# Phase 03 — Request pipeline + numeric/safety validator + offline fallback

**Brainstorm:** Phase 1 (signature move #3 "niềm tin nhìn thấy được") · **Backlog:** PFM-062, PFM-072/073, PFM-111 · **Priority:** P0 · **Status:** ✅ done

## Context links

- `docs/ARCHITECTURE.md` §Request pipeline (read/analysis) — trình tự bắt buộc.
- `src/insights/narrate.ts` — `numbersIn`, `factValues` (tái dùng cho grounding).
- `src/insights/assistant.ts` — switch-case cũ → tái dùng làm **formatter + offline fallback**.
- `src/lib/consent.ts` — scope check.

## Overview

Trái tim của facade: orchestrator server-side chạy đúng pipeline `intent → consent/scope → required-data → tool → LLM narrate → validate → answer + sources + assumptions`. Validator numeric chặn mọi số không trace về tool-result (chống hallucination). Khi LLM lỗi → fallback offline dùng template cũ.

## Key insights

- LLM tự chọn tool qua tool-use loop; server thực thi tool (deterministic) rồi feed kết quả lại. Lặp tới khi LLM ra câu trả lời cuối.
- **Numeric validator là guardrail cứng**: trích số trong narrative (`numbersIn`), so với tập số hợp lệ gom từ mọi `ToolResult.data` đã chạy (dung sai làm tròn). Số lạ → chặn/hỏi lại/strip. Đây là "wow niềm tin".
- Intent classification giữ **rẻ**: heuristic keyword trước; chỉ để LLM router khi mơ hồ (YAGNI — tránh 2 lượt LLM mỗi câu).
- Fallback offline: map intent → `answerPrompt(id, financials)` cũ (đã có sources). Đảm bảo success metric "AI fallback chạy offline".

## Requirements

**Functional**
- Pipeline nhận `messages` + `AiContext` → phát `LlmStreamEvent` (text delta, tool_use/tool chip, chart payload, done, error).
- Consent/scope: câu hỏi cần scope chưa cấp → trả lời từ chối lịch sự + hướng dẫn cấp quyền (không lộ dữ liệu).
- Required-data: thiếu dữ liệu (vd hỏi mục tiêu chưa tạo) → hỏi lại / nêu rõ không trả lời chắc được (PFM-072).
- Unsafe-advice: từ chối bảo đảm lợi nhuận, dự đoán vô căn cứ, yêu cầu hành động/chuyển tiền (PFM-073). Ở Phase 1 mọi action intent → "chưa hỗ trợ" (Tier B mở ở Phase 08).
- Validator: numeric grounding + schema (câu trả lời có Answer/period/source/assumptions khi liên quan) + safety.
- Fallback: LLM lỗi/timeout/thiếu key → template offline theo intent, gắn cờ `degraded`.

## Architecture

```
src/ai/pipeline/
  intent.ts          # classifyIntent(text) → { kind, needsScopes, toolHints }
  scope-check.ts     # ensureScopes(intent, ctx.scopes)
  required-data.ts   # checkRequiredData(intent, ctx)
  orchestrator.ts    # runAssistant(messages, ctx) → AsyncIterable<LlmStreamEvent>
  validator.ts       # validateNumeric(text, toolResults) + validateSafety(text)
  fallback.ts        # offlineAnswer(intent, ctx) dùng assistant.ts
  system-prompt.ts   # system prompt (ràng buộc: chỉ dùng số từ tool, VN, có nguồn)
```

`orchestrator` gọi `getLlmClient().streamMessage({ system, messages, tools: TIER_A_TOOLS schema })`; khi gặp `tool_use` → `getTool(name).handler(input, ctx)` → feed `tool_result` → tiếp tục; text cuối chạy `validateNumeric` trước khi phát `done`.

## Related code files

**Create**
- `src/ai/pipeline/intent.ts`, `scope-check.ts`, `required-data.ts`, `orchestrator.ts`, `validator.ts`, `fallback.ts`, `system-prompt.ts`
- `src/ai/pipeline/__tests__/validator.test.ts`, `orchestrator.test.ts` (LLM client mock)

**Modify**
- `src/app/api/assistant/route.ts` — thay skeleton bằng `runAssistant`.
- `src/insights/assistant.ts` — export mapping intent→answer để fallback tái dùng (không đổi hành vi cũ).

## Implementation steps

1. `intent.ts`: phân loại `explain_month | top_category | upcoming | networth | whatif_goal | whatif_debt | action_transfer | unknown`; gắn `needsScopes`, `toolHints`.
2. `scope-check.ts` + `required-data.ts`: trả `{ ok, reason }`; reason dùng để phát text từ chối/hỏi lại.
3. `system-prompt.ts`: ràng buộc rõ — tiếng Việt, CHỈ dùng số từ tool-result, luôn nêu nguồn/kỳ/giả định, không bảo đảm lợi nhuận, không chuyển tiền, thiếu dữ liệu thì nói không biết.
4. `orchestrator.ts`: vòng lặp tool-use; gom `toolResults[]`; stream text; action intent → phát text "chưa hỗ trợ giao dịch ở bản này" (chặn sớm).
5. `validator.ts`: `validateNumeric(text, toolResults)` — `numbersIn(text)` ⊆ tập số hợp lệ (gom từ `toolResults` + dung sai làm tròn/nghìn); vi phạm → trả danh sách số lạ. `validateSafety` — regex bảo đảm/dự đoán tuyệt đối.
6. Tích hợp validator vào orchestrator: fail numeric → không phát câu đó, thay bằng "Tôi chưa chắc con số này, để tôi kiểm tra lại" + log (không bịa).
7. `fallback.ts`: try LLM; catch → `offlineAnswer(intent, ctx)` (template cũ) + event `degraded`.
8. Test: validator bắt số bịa (golden — PFM-111); scope bị từ chối; required-data hỏi lại; fallback chạy khi client mock throw.
9. build/lint/test xanh.

## Todo

- [x] intent classifier (heuristic)
- [x] scope + required-data checks
- [x] system prompt ràng buộc
- [x] orchestrator tool-use loop + streaming
- [x] numeric validator (grounding) + safety validator
- [x] tích hợp validator chặn số bịa
- [x] offline fallback dùng template cũ
- [x] route dùng runAssistant; test suite (mock LLM) xanh

## Success criteria

- Câu hỏi thật → LLM gọi đúng tool, trả lời grounded; validator pass.
- Golden test: narrative chứa số bịa → validator chặn (100% số hiển thị trace tool-result).
- Scope chưa cấp / thiếu dữ liệu → từ chối/hỏi lại đúng, không lộ dữ liệu.
- LLM lỗi → fallback offline trả lời + cờ degraded.

## Risks

- **2 lượt LLM tốn kém/chậm**: intent heuristic trước, chỉ 1 lượt LLM chính. Cân nhắc cache theo intent (brainstorm §7).
- **Validator quá gắt chặn số đúng**: dung sai làm tròn + đơn vị nghìn/triệu; test cả số hợp lệ để tránh false positive.
- **Prompt injection qua merchant name**: system prompt + validator + không cho tool nội suy; safety test ở Phase 05.

## Security

- Consent/scope tôn trọng `ConsentGate`/`lib/consent.ts`. PII minimization trong prompt/log.
- Action intent bị chặn cứng ở Phase 1 (không có Tier B). Không số TK, không OTP.

## Next

→ Phase 04: chat UI streaming + source chips + mini chart what-if.
