# Phase 02 — Tool layer (Tier A read tools) + deterministic simulations

**Brainstorm:** Phase 1 · **Backlog:** PFM-071, PFM-050/051, EPIC-09 · **Priority:** P0 · **Status:** ✅ done

## Context links

- `docs/ARCHITECTURE.md` §AI facade → Tier A tools list (canonical names).
- `src/domain/engine/*` — cashflow, category, budget, networth, obligations (đã có).
- **Chưa có**: goals/debt simulation engine (Goal model có ở `models/index.ts` nhưng không có projection).

## Overview

Bọc engine deterministic thành bộ tool read-only whitelisted mà LLM gọi được. Mỗi tool có JSON schema + handler thuần đọc từ `AiContext`. Bổ sung 2 engine simulation còn thiếu (`simulateGoal`, `simulateDebtRepayment`) để phục vụ what-if — **số ra từ engine, không từ LLM**.

## Key insights

- Tool = adapter mỏng quanh engine, KHÔNG chứa business logic mới. Logic tính nằm trong engine (test riêng).
- `simulateGoal`/`simulateDebtRepayment` chưa tồn tại → phải viết engine thuần + test trước khi làm tool (invariant #1).
- Tool result phải mang **structured facts + provenance** (period/source) để validator (Phase 03) và source chips (Phase 04) dùng lại. Tái dùng pattern `factValues`/`numbersIn` từ `src/insights/narrate.ts`.

## Requirements

**Functional — Tier A tools (whitelist)**
- `getMonthlyCashflow(period)` → income/expense/fixed/discretionary/net + period + source.
- `getSpendingByCategory(period)` → mảng {categoryId, label, amount, share}.
- `getUpcomingObligations(horizonDays)` → obligations (amount có thể `unknown`).
- `calculateNetWorth(asOf)` → assets/liabilities/net + coverage + freshness.
- `simulateGoal(goalId, { monthlyContribution })` → projection series + tháng đạt mục tiêu.
- `simulateDebtRepayment(liabilityId, { monthlyPayment })` → series số dư + tháng tất toán + lãi ước tính.

**Non-functional**
- Mỗi tool: `{ name, description, inputSchema, handler(input, ctx) }`. Input validate bằng schema; input sai → structured error, không throw.
- Handler thuần, không I/O; đọc `AiContext.financials/raw`. Deterministic.

## Architecture

```
src/domain/engine/goals.ts        # simulateGoal (thuần) + test
src/domain/engine/debt.ts         # simulateDebtRepayment (thuần) + test
src/ai/tools/
  types.ts        # AiTool, ToolResult { data, sources[], period? }
  registry.ts     # TIER_A_TOOLS: AiTool[] + getTool(name)
  read-tools.ts   # 4 tool bọc engine sẵn có
  sim-tools.ts    # simulateGoal / simulateDebtRepayment tools
```

`ToolResult.sources`: nhãn nguồn/kỳ (vd "Dòng tiền T8/2026 — từ giao dịch, đã loại chuyển khoản nội bộ"). `ToolResult.data` = object số học (validator sẽ trace).

## Related code files

**Create**
- `src/domain/engine/goals.ts`, `src/domain/engine/debt.ts`
- `src/domain/engine/__tests__/goals.test.ts`, `src/domain/engine/__tests__/debt.test.ts`
- `src/ai/tools/types.ts`, `registry.ts`, `read-tools.ts`, `sim-tools.ts`
- `src/ai/tools/__tests__/tools.test.ts`

**Modify**
- `src/domain/engine/index.ts` — export goals, debt.

## Implementation steps

1. `goals.ts`: `simulateGoal(goal, { monthlyContribution, asOf })` → tính tháng cần thiết = ceil((target-current)/contribution); trả `{ series: [{month, projected}], monthsToTarget, targetDate, assumptions }`. Missing target/contribution ≤ 0 → trạng thái không xác định (không default 0).
2. `debt.ts`: `simulateDebtRepayment(liability, { monthlyPayment })` → amortization đơn giản dùng `outstandingPrincipal`, `interestRate`; trả series số dư + tháng tất toán + tổng lãi. Thiếu rate/principal → unknown.
3. Test deterministic cho cả 2 vs fixtures (edge: contribution=0, đã đạt mục tiêu, payment < lãi tháng → cảnh báo không bao giờ tất toán).
4. `tools/types.ts`: định nghĩa `AiTool`, `ToolResult`.
5. `read-tools.ts`: 4 tool bọc `aggregateCashflow`/`spendingByCategory`/`upcomingObligations`/`calculateNetWorth` từ `ctx.financials`. Mỗi tool set `sources`.
6. `sim-tools.ts`: 2 tool gọi engine mới; resolve goalId/liabilityId từ `ctx.raw`; id không tồn tại → structured error.
7. `registry.ts`: gom `TIER_A_TOOLS`, `getTool(name)`, hàm export schema sang format LLM-neutral (map ở Phase 03/adapter).
8. Test: mỗi tool trả `data` số khớp engine + `sources` không rỗng; input sai bị từ chối.
9. build/lint/test xanh.

## Todo

- [x] `simulateGoal` engine + test (edge cases)
- [x] `simulateDebtRepayment` engine + test (edge cases)
- [x] `AiTool`/`ToolResult` types
- [x] 4 read tools bọc engine + sources
- [x] 2 simulation tools + resolve id + error path
- [x] registry + schema export
- [x] tools test suite xanh

## Success criteria

- 6 tool trả structured data khớp engine (deterministic), mỗi kết quả có `sources`.
- Engine simulation đạt 100% vs fixtures; edge cases (0/unknown/không tất toán) xử lý đúng, không default 0.
- Không tool nào chứa logic tính tài chính trùng lặp (chỉ bọc engine).

## Risks

- **Simulation phức tạp hoá (YAGNI)**: giữ mô hình đơn giản, explicit assumptions; không thêm lãi kép/thuế trừ khi backlog yêu cầu.
- **Số từ tool lệch engine**: tool chỉ gọi engine, không tự tính → test khớp.

## Security

- Tool read-only tuyệt đối (Tier A). Không tool nào ghi/chuyển tiền. `findRecipient`/`prepareTransferDraft` (Tier B) để Phase 08.
- Tool nhận input đã validate schema; merchant/id không dùng để nội suy số TK (chống injection — Phase 05/08).

## Next

→ Phase 03: pipeline nối LLM ↔ tool + numeric/schema/safety validator + offline fallback.
