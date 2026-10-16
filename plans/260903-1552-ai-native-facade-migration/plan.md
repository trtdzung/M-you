---
status: in-progress
type: implementation-plan
title: AI-native facade migration (từ web report tĩnh → feature AI sống trong app)
created: 2026-09-03
source: plans/reports/brainstorm-260903-ai-native-repositioning.md
blockedBy: []
blocks: []
---

# AI-native facade migration

Reposition MSB PFM từ *web report tĩnh đội lốt điện thoại* → *feature AI-native sống trong app*.
Nguồn: `plans/reports/brainstorm-260903-ai-native-repositioning.md` (Approach B, đã chốt).

## Bối cảnh & quyết định

- **LLM layer provider-agnostic**: interface trung lập `LlmClient`; Anthropic Claude là impl mặc định. Key server-side (`.env.local`), không expose client.
- **Bất biến (CLAUDE.md) không phá**: engine deterministic = nguồn số duy nhất; AI là facade non-committing 2 tier (read + draft); không tự chuyển tiền; mọi số có provenance; missing ≠ 0.
- **Gap hiện tại**: `src/insights/assistant.ts` = switch-case 3 nút; chưa có LLM SDK, chưa có `src/app/api/`, chưa có goals/debt simulation engine, `computeFinancials` bị khoá trong React hook (client-only).

## Nguyên tắc chủ đạo (kiến trúc bắt buộc)

Pipeline mỗi request AI: `intent → consent/scope → required-data → tool (deterministic) → LLM narrate (stream) → numeric/schema/safety validate → answer + source chips + assumptions` (hoặc draft handoff ở Phase 4). Số nào không trace về tool-result thì bị chặn.

## Phases

Brainstorm gồm 4 phase; Phase 1 (ưu tiên #1) tách thành 5 file chi tiết, Phase 2–4 outline.

| # | Phase file | Brainstorm | Backlog | Trạng thái |
|---|---|---|---|---|
| 01 | [phase-01-foundation-llm-adapter.md](phase-01-foundation-llm-adapter.md) | P1 | PFM-000, PFM-071 | ✅ done |
| 02 | [phase-02-tool-layer-simulations.md](phase-02-tool-layer-simulations.md) | P1 | PFM-071, PFM-050/051, EPIC-09 | ✅ done |
| 03 | [phase-03-pipeline-validator-fallback.md](phase-03-pipeline-validator-fallback.md) | P1 | PFM-062, PFM-072/073, PFM-111 | ✅ done |
| 04 | [phase-04-chat-streaming-ui.md](phase-04-chat-streaming-ui.md) | P1 | PFM-070, EPIC-08 | ✅ done |
| 05 | [phase-05-proactive-audit-safety.md](phase-05-proactive-audit-safety.md) | P1 | PFM-060, PFM-091/092, PFM-111 | ✅ done |
| 06 | [phase-06-ux-overhaul-banking.md](phase-06-ux-overhaul-banking.md) | P2 | PFM-006, EPIC-01 | outline (chờ screenshot MSB) |
| 07 | [phase-07-polish-states-motion.md](phase-07-polish-states-motion.md) | P3 | PFM-112, PFM-090 | outline |
| 08 | [phase-08-assisted-transfer-drafting.md](phase-08-assisted-transfer-drafting.md) | P4 | EPIC-13, PFM-093 | outline (Level 3 gate) |

> **Cập nhật 2026-09-03:** Phase 01–05 (ưu tiên #1 — AI facade thật) đã hoàn thành. 94 test xanh, `npm run build`/`lint` sạch, không rò key ở client bundle. Đã xử lý findings từ code review (year-in-period false flag, tolerance stacking, guard chống claim giao dịch đã hoàn tất, prompt rule chống injection từ tool-result). LLM provider giữ linh hoạt (interface trung lập, Anthropic mặc định, tự fallback offline khi thiếu key). Còn lại: 06 (chờ screenshot MSB), 07 (polish), 08 (Level 3 gate).

## Dependency order

```
01 foundation ─► 02 tools ─► 03 pipeline ─► 04 chat UI ─► 05 proactive+safety
                                                              │
                                    (Phase 1 done = ưu tiên #1 hoàn thành)
                                                              ▼
06 UX overhaul (chờ screenshot MSB)  ─►  07 polish  ─►  08 assisted transfer (Level 3 gate)
```

Phase 06/07/08 **không** block Phase 1. Phase 08 phụ thuộc Phase 03 (tool/pipeline) + PFM-093 action boundary.

## Success (Phase 1 = definition of "wow thật")

- Hỏi free-text bất kỳ về cashflow/networth/category/obligation → trả lời grounded, có nguồn.
- 100% số hiển thị trace được về tool-result (validator pass, có golden test).
- ≥2 what-if simulation (goal, debt) có mini chart trong chat.
- Fallback offline chạy khi LLM lỗi/mất mạng.
- AI audit event ghi đủ; safety tests (injection/unsafe-advice/PII) pass.

## Ràng buộc chung (mọi phase)

- File < 200 dòng, kebab-case. YAGNI/KISS/DRY.
- Mỗi rule tài chính mới → deterministic test cùng change (engine đạt 100% vs fixtures).
- Phủ empty/loading/error/insufficient-data cho mọi feature UI.
- Không import fixture trực tiếp; đi qua provider. Mọi số kèm period/source/freshness.
