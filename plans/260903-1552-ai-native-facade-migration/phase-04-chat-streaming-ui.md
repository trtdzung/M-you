# Phase 04 — Chat UI: free-text streaming + source chips + what-if mini charts

**Brainstorm:** Phase 1 (signature moves #1, #2) · **Backlog:** PFM-070, EPIC-08 · **Priority:** P0 · **Status:** ✅ done

## Context links

- `src/app/assistant/page.tsx` — trang nút cứng hiện tại (thay thế).
- `src/components/charts/ChartFrame.tsx`, `IncomeExpenseChart.tsx` — mẫu chart tái dùng cho mini chart.
- `src/components/primitives/*` — Card, SourceBadge, Freshness, Money (tái dùng).
- `src/state/useFinancials.ts`, `src/state/period.tsx`, persona context — lấy personaId/month gửi API.

## Overview

Thay 3 nút cứng bằng khung chat free-text streaming: người dùng gõ bất kỳ, câu trả lời chảy dần, mỗi số kèm **source chip** (nguồn/kỳ), what-if trả về **mini chart trong bong bóng chat**. Giữ suggested prompts như gợi ý mở đầu (không phải cổng duy nhất).

## Key insights

- Client `fetch('/api/assistant')` đọc `ReadableStream`, parse `LlmStreamEvent` (newline-delimited JSON). Render tăng dần.
- Mini chart what-if: tool `simulateGoal`/`simulateDebtRepayment` trả series → event `chart` → render Recharts nhỏ trong message (tái dùng `ChartFrame`). Read-only, số từ engine.
- Source chip: event `tool_use`/`toolResult` mang `sources[]` → render chip dưới message; bấm mở chi tiết period/source/freshness (tái dùng `SourceBadge`/`Freshness`).
- Cờ `degraded` (fallback offline) → hiển thị nhãn "chế độ ngoại tuyến" nhẹ, không phá trải nghiệm.

## Requirements

**Functional**
- Ô nhập free-text + gửi; lịch sử hội thoại trong session; suggested prompts điền sẵn ô nhập.
- Streaming: text chảy dần; trạng thái "đang nghĩ"/"đang tính…" khi tool chạy.
- Source chips gắn với số; what-if hiển thị mini chart + tóm tắt số (tháng đạt mục tiêu…).
- States: empty (mở đầu), loading/streaming, error (LLM lỗi → thông báo + gợi ý thử lại), insufficient-data (khi pipeline báo thiếu).
- Banner an toàn "chỉ đọc & giải thích, không chuyển tiền" giữ nguyên (Phase 1).

**Non-functional**
- Mobile-first, không vỡ layout (lỗi format tận gốc để Phase 06). Không import fixture trực tiếp.

## Architecture

```
src/components/assistant/
  ChatPanel.tsx        # container: state hội thoại + gọi stream
  ChatMessage.tsx      # bong bóng user/assistant, render text + chips + chart
  SourceChips.tsx      # chip nguồn/kỳ (SourceBadge + popover)
  WhatIfChart.tsx      # mini chart projection (ChartFrame + Recharts)
  Composer.tsx         # ô nhập + suggested prompts
src/lib/assistant-stream.ts   # client: fetch + parse NDJSON LlmStreamEvent
```

`src/app/assistant/page.tsx` → render `ChatPanel` (giữ khối "Đáng chú ý"/insights, sẽ nâng ở Phase 05).

## Related code files

**Create**
- `src/components/assistant/ChatPanel.tsx`, `ChatMessage.tsx`, `SourceChips.tsx`, `WhatIfChart.tsx`, `Composer.tsx`
- `src/lib/assistant-stream.ts`
- `src/components/assistant/__tests__/ChatPanel.test.tsx` (mock stream)

**Modify**
- `src/app/assistant/page.tsx` — thay UI nút cứng bằng `ChatPanel`.

## Implementation steps

1. `assistant-stream.ts`: `streamAssistant({ personaId, month, messages }, onEvent)` — POST, đọc `res.body.getReader()`, tách dòng, `JSON.parse` mỗi `LlmStreamEvent`, gọi `onEvent`.
2. `ChatPanel.tsx`: state `messages[]`; gửi → thêm message user + message assistant rỗng; onEvent nối text delta, gắn chips/chart, set trạng thái tool.
3. `Composer.tsx`: textarea + nút gửi (Enter gửi, Shift+Enter xuống dòng); suggested prompts điền ô nhập (tái dùng `SUGGESTED_PROMPTS`, mở rộng thêm what-if mẫu).
4. `ChatMessage.tsx`: render markdown-nhẹ text; nếu có `chart` → `WhatIfChart`; nếu có `sources` → `SourceChips`.
5. `WhatIfChart.tsx`: LineChart projection (tháng × số dư/tích luỹ), label tháng đạt mục tiêu; dùng `ChartFrame`.
6. `SourceChips.tsx`: chip "Nguồn · kỳ" bấm mở period/source/freshness.
7. States: streaming skeleton, error retry, degraded badge, insufficient-data message.
8. Thay `page.tsx`; test render với stream mock (text + chart + chips).
9. build/lint/test xanh; kiểm mobile viewport không vỡ.

## Todo

- [x] client stream reader (NDJSON)
- [x] ChatPanel state + wiring
- [x] Composer free-text + suggested prompts
- [x] ChatMessage render text/chips/chart
- [x] WhatIfChart mini projection
- [x] SourceChips popover period/source/freshness
- [x] empty/loading/error/degraded/insufficient states
- [x] thay assistant page; test stream mock xanh

## Success criteria

- Gõ câu bất kỳ → câu trả lời chảy dần, có source chip cho mỗi số.
- ≥2 what-if (goal, debt) hiển thị mini chart trong chat.
- LLM lỗi → UI báo lỗi/thử lại; fallback degraded hiển thị nhãn.
- Không vỡ layout ở khung điện thoại; không import fixture trực tiếp.

## Risks

- **Streaming trên Next route + Windows dev**: test `ReadableStream` thật; nếu buffering, dùng chunk NDJSON rõ ràng.
- **Render số ngoài chip (lách grounding)**: mọi số đến từ text đã qua validator (Phase 03); chip chỉ hiển thị nguồn, không sinh số mới.

## Security

- Client không giữ key (gọi qua route). Không render dữ liệu ngoài scope đã cấp.

## Next

→ Phase 05: proactive openers từ detectors + AI audit + safety test suite (đóng Phase 1).
