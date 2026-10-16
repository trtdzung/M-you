# Phase 07 — Polish: states, motion, hoàn thiện provenance UI

**Brainstorm:** Phase 3 · **Backlog:** PFM-112, PFM-090 · **Priority:** P2/P3 · **Status:** OUTLINE

> Không block Phase 1. Chi tiết hoá sau Phase 06 (dùng tokens/layout MSB).

## Mục tiêu

Đưa toàn app đạt "definition of done": trạng thái đầy đủ, chuyển động mượt, provenance hiển thị nhất quán, accessibility.

## Hạng mục

1. **States đồng bộ**: rà soát mọi màn hình + ChatPanel có đủ empty / loading / error / insufficient-data (tái dùng `src/components/states/*`).
2. **Motion**: streaming chat mượt, skeleton, transition nav — nhẹ, không lạm dụng.
3. **Provenance UI hoàn thiện (PFM-090)**: nhãn `msb`/`self_reported`/`estimated`/`mock` + freshness nhất quán trên mọi số (tái dùng `SourceBadge`/`Freshness`); source chips chat khớp phong cách chung.
4. **Accessibility/responsive QA (PFM-112)**: charts, contrast, touch target, keyboard nav, labels.

## Ràng buộc

- Chỉ presentation/interaction; không đổi engine/AI contract.
- Không phá grounding: chip nguồn không sinh số mới.

## Định nghĩa hoàn thành (sơ bộ)

- Mọi feature phủ đủ 4 state; provenance nhất quán toàn app.
- Pass accessibility/responsive QA checklist (PFM-112).

## Next

→ Phase 08 assisted transfer drafting (Level 3 gate).
