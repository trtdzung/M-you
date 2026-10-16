# Phase 01 — Foundation: LLM adapter, server-safe financials, API skeleton

**Brainstorm:** Phase 1 · **Backlog:** PFM-000, PFM-071 · **Priority:** P0 · **Status:** ✅ done

## Context links

- `src/state/useFinancials.ts` — composition hiện tại (client-only, cần tách phần thuần).
- `src/providers/mock/mock-provider.ts`, `src/providers/interfaces.ts` — provider (pure TS, chạy được server-side).
- `src/lib/consent.ts` — consent scopes (`transactions|assets|liabilities|ai`).
- `docs/ARCHITECTURE.md` §AI facade (2 tool tiers, pipeline).

## Overview

Đặt nền cho AI facade thật: (1) tách logic tính tài chính khỏi React hook thành hàm thuần dùng được cả server, (2) một LLM adapter provider-agnostic (Anthropic mặc định), (3) khung API route streaming server-side giữ key. Chưa có tool/pipeline thật ở phase này — chỉ đường ống.

## Key insights

- `useFinancials` nhét toàn bộ composition vào `useMemo` → server không tái dùng được. Trích `computeFinancials(raw, month)` thuần (DRY), hook chỉ còn wrap state.
- Mock provider là class TS thuần, không phụ thuộc DOM → khởi tạo trực tiếp trong route handler. Không phá invariant #4 (vẫn đi qua interface `Providers`).
- Provider-agnostic: định nghĩa `LlmClient` trung lập; Anthropic là 1 adapter. Đổi provider = đổi 1 file.

## Requirements

**Functional**
- `computeFinancials(raw, month)` thuần trả về `Financials` (đúng shape cũ), test được không cần React.
- `LlmClient` hỗ trợ tool-use + streaming; adapter Anthropic đọc key từ env server-side.
- `POST /api/assistant` route handler: nhận `{ personaId, month, messages }`, load raw qua provider server-side, trả về `ReadableStream` sự kiện text (chưa cần tool ở phase này — echo/passthrough để verify đường ống).

**Non-functional**
- Key không bao giờ xuống client; route chạy Node runtime (không Edge — cần fs/SDK).
- Lỗi LLM/thiếu key → trả lỗi có cấu trúc, không throw trần.

## Architecture

```
src/ai/
  llm/
    types.ts            # LlmClient, LlmMessage, LlmTool, LlmStreamEvent (trung lập)
    anthropic-client.ts # adapter mặc định (@anthropic-ai/sdk)
    index.ts            # getLlmClient() đọc env chọn adapter
  server/
    load-financials.ts  # tạo mock provider + computeFinancials → AiContext
src/domain/engine/finance-compose.ts   # computeFinancials(raw, month) thuần (trích từ hook)
src/app/api/assistant/route.ts         # route handler streaming (skeleton)
```

`LlmStreamEvent` = `{ type: 'text', delta }` | `{ type: 'tool_use', id, name, input }` | `{ type: 'tool_result_needed' }` | `{ type: 'done' }` | `{ type: 'error', message }`.

## Related code files

**Create**
- `src/domain/engine/finance-compose.ts`
- `src/ai/llm/types.ts`, `src/ai/llm/anthropic-client.ts`, `src/ai/llm/index.ts`
- `src/ai/server/load-financials.ts`
- `src/app/api/assistant/route.ts`
- `src/domain/engine/__tests__/finance-compose.test.ts`
- `.env.example` (thêm `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LLM_MODEL`)

**Modify**
- `src/state/useFinancials.ts` — dùng `computeFinancials` (bỏ logic trùng trong `useMemo`).
- `package.json` — thêm `@anthropic-ai/sdk`.
- `.gitignore` — đảm bảo `.env*.local` bị ignore (kiểm tra).

## Implementation steps

1. Trích `computeFinancials(raw: RawData, month: string): Financials` vào `finance-compose.ts` (copy đúng logic `useMemo` hiện tại: recurring, cashflow, prevCashflow, networth, budgetLines, categorySpend, obligations). Import từ engine.
2. Sửa `useFinancials` gọi `computeFinancials(raw, month)` — xác minh mọi màn hình vẫn chạy (`npm run build`).
3. Thêm deterministic test cho `computeFinancials` vs fixtures (khớp giá trị hook cũ).
4. Định nghĩa `LlmClient` interface + types trung lập trong `llm/types.ts`.
5. `anthropic-client.ts`: implement `streamMessage({ system, messages, tools })` → async iterable `LlmStreamEvent`, map từ Anthropic streaming (`content_block_delta`, `tool_use`). Đọc `ANTHROPIC_API_KEY`, `LLM_MODEL`.
6. `llm/index.ts`: `getLlmClient()` chọn adapter theo `LLM_PROVIDER` (mặc định `anthropic`); throw có ngữ cảnh nếu thiếu key.
7. `load-financials.ts`: `buildAiContext(personaId, month)` → khởi tạo mock provider, load raw, `computeFinancials`, gom consent scopes; trả `AiContext { financials, raw, scopes }`.
8. `route.ts`: `export const runtime = 'nodejs'`; `POST` đọc body, `buildAiContext`, stream 1 câu text từ LLM (chưa tool) qua `ReadableStream`; bắt lỗi → event `error`.
9. `npm run build` + `npm run lint` + `npm run test` xanh.

## Todo

- [x] `computeFinancials` thuần + test khớp fixtures
- [x] `useFinancials` refactor dùng compose (không đổi hành vi UI)
- [x] `LlmClient` types trung lập
- [x] Anthropic adapter streaming + tool-use mapping
- [x] `getLlmClient()` chọn provider theo env
- [x] `buildAiContext` server-side qua provider
- [x] `/api/assistant` route skeleton streaming + error path
- [x] `.env.example`, gitignore key, build/lint/test xanh

## Success criteria

- `computeFinancials` test xanh, giá trị khớp hook cũ (không regression UI).
- `POST /api/assistant` trả stream text thật từ Claude khi có key; trả event `error` gọn khi thiếu key/lỗi mạng.
- Không có key nào trong bundle client (grep `ANTHROPIC` trong `.next` output client = rỗng).

## Risks

- **Rò key**: chỉ đọc env trong module server (`route.ts`/`ai/llm`), không import vào client component. Mitigation: đặt guard `import 'server-only'` ở `ai/llm/index.ts`.
- **Refactor hook gây regression**: có test compose + build toàn app trước khi qua phase sau.

## Security

- Key server-side, `.env.local` gitignored, `.env.example` không chứa giá trị thật.
- Route Node runtime, không log nội dung nhạy cảm (PII minimization — ARCHITECTURE §Security).

## Next

→ Phase 02: bọc engine thành tool layer (Tier A) + bổ sung simulation engine.
