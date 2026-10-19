# IMPLEMENTATION PLAN: Proactive Insights & Financial Health Engine (Bảng 2 & Bảng 3)

> **Target System:** MSB Financial Copilot (PFM)
> **Objective:** Nâng cấp và chuẩn hóa hệ thống chấm điểm Sức khỏe Tài chính (Bảng 2 - High-level) và Hệ thống Gợi ý Chủ động 4 nhóm (Bảng 3 - Low-level) kèm cơ chế điều phối chống spam (Anti-spam Dispatcher) và lớp diễn giải LLM an toàn.

---

## 0. Ràng buộc Kiến trúc Bất biến (Strict Guardrails cho Coding Agent)

Khi triển khai kế hoạch này, Coding Agent **BẮT BUỘC** tuân thủ 5 quy tắc cốt lõi của hệ thống:
1. **Deterministic First (`src/domain/engine/*`):** Toàn bộ điểm số (0–100), phần trăm, số tiền thiếu hụt, tiền nhàn rỗi, số ngày đáo hạn phải được tính bằng hàm TypeScript thuần (pure functions). **Tuyệt đối không để LLM làm phép tính cộng/trừ/nhân/chia.**
2. **Preserve `null` / `unknown`:** Khi thiếu dữ liệu (ví dụ: chưa khai báo bảo hiểm, căn hộ có `value: null`), giữ nguyên trạng thái `null`, **tuyệt đối không gán bằng `0`**. Khi một chỉ số có điểm `null`, tự động chuẩn hóa lại trọng số (re-normalize weights) của các chỉ số còn lại để tổng trọng số luôn bằng `1.0` (100%).
3. **Provenance Tracking:** Mọi chỉ số và insight sinh ra phải gắn nhãn `source`: `'msb' | 'self_reported' | 'estimated' | 'mock'`.
4. **Constrained Action Chips:** Các chip hành động chỉ được phép ánh xạ tới các UI Payload/Draft Tools hợp lệ: `transfer_form`, `create_jar`, `edit_jar`, `rebalance_jars`, `distribute_amount`, `chart`, hoặc `open_profile_modal`.
5. **No Direct Fixture Imports in Engine/UI:** Luôn truyền dữ liệu qua `Providers` interface hoặc tham số hàm của `computeFinancials`.

---

## 1. Cấu trúc File & Module cần tạo mới / cập nhật

```text
src/
├── domain/
│   ├── types/
│   │   └── proactive-insights.ts       # [NEW] Định nghĩa toàn bộ TypeScript Interfaces cho Bảng 2, Bảng 3, Quota
│   └── engine/
│       ├── health-score.ts             # [NEW] Thuật toán chấm điểm Bảng 2 (Nội suy tuyến tính, Độ phủ data, Đòn bẩy)
│       ├── low-level-insights.ts       # [NEW] Bộ quy tắc phát hiện 4 nhóm Insight Bảng 3 (Deterministic Triggers)
│       ├── insight-dispatcher.ts       # [NEW] Bộ lọc chống spam, chấm điểm ưu tiên, phân luồng Push vs Feed
│       └── finance-compose.ts          # [MODIFY] Tích hợp healthScore và lowLevelInsights vào luồng computeFinancials
├── lib/
│   └── llm/
│       └── insight-narrator.ts         # [NEW] Prompt & Guardrail gọi LLM để cá nhân hóa câu chữ từ số liệu tất định
├── app/
│   └── api/
│       └── proactive-insights/
│           ├── profile/route.ts        # [MODIFY] Đồng bộ localStorage (assets, liabilities, goals) vào SQLite
│           └── current/route.ts        # [MODIFY] Chạy Engine + Dispatcher + Lưu trạng thái SQLite + Gọi Narrator
└── state/
    └── useFinancials.ts                # [MODIFY] Expose dữ liệu Bảng 2 & Bảng 3 cho các UI Components