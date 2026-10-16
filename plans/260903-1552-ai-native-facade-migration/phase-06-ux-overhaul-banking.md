# Phase 06 — Đại tu UX chuẩn banking (bám screenshot MSB thật)

**Brainstorm:** Phase 2 · **Backlog:** PFM-006, EPIC-01 · **Priority:** P2 · **Status:** OUTLINE — blocked on input

> **Blocker:** cần user cung cấp screenshots/app MSB thật + mô tả/ảnh lỗi mobile cụ thể (brainstorm §9). Không block Phase 1. Sẽ chi tiết hoá thành phase-by-phase khi có tài liệu.

## Mục tiêu

Sửa sai định vị "web report tĩnh": dựng lại shell + màn hình mang **design language MSB thật**, fix lỗi format mobile **tận gốc** (không chỉ vá).

## Vấn đề đã xác định (brainstorm §1)

- `PhoneShell.tsx` chỉ là cột `max-w-phone` căn giữa — phone-frame giả.
- UI generic (Tailwind card, đỏ MSB + Inter) — "vibe app tự sinh", không phải MSB.
- Lỗi format trên mobile thật.

## Hạng mục (sẽ tách phase khi có screenshot)

1. **Design tokens từ MSB thật**: màu, typography, spacing, radius, elevation trích từ screenshot (thay token generic). Tái dùng `src/components/primitives/*`.
2. **Shell/nav**: dựng lại `PhoneShell`/`BottomNav`/`StatusBar`/`ScreenHeader` theo bố cục MSB.
3. **Màn hình chính**: Overview, Transactions, Cashflow, Wealth, Assistant — bám layout MSB, sửa lỗi mobile tận gốc.
4. **Chat AI hoà vào ngôn ngữ MSB**: ChatPanel (Phase 04) reskin theo tokens mới.

## Ràng buộc

- Không phá provider/engine/AI contract (chỉ presentation).
- Giữ empty/loading/error/insufficient-data; mọi số vẫn kèm source/freshness.
- Mobile-first thật; QA responsive (nối Phase 07 / PFM-112).

## Định nghĩa hoàn thành (sơ bộ)

- UI khớp screenshot MSB; hết lỗi layout trên mobile thật (brainstorm §8).
- Không đổi kết quả tính toán/AI grounding.

## Next

→ Phase 07 polish states/motion/provenance.
