# PFM handoff — trạng thái hiện tại

**Cập nhật:** 22/09/2026 · **Workspace:** `D:\MSB Hackathon\pfm` · **branch:** `STT-refine`

## Mục tiêu đang làm

Proactive insight trên Trang chủ — 3 mode ưu tiên:

| Ưu tiên | Điều kiện | Hành động |
|---|---|---|
| 1 | Hũ biến động dự báo cạn trước cuối tháng | **Cảnh báo hũ** + agent giải thích |
| 2 | An toàn + `unallocatedPool.amount > 0` | **Feature engineering** → gửi agent → agent chọn sản phẩm & viết gợi ý |
| 3 | Không có trigger nào | **Fallback theo dõi** (không gọi agent) |

## Kiến trúc investment nudge (KHÔNG hardcode ngưỡng)

```
Financials (cashflow, jar, networth, goals, runway…)
    ↓ extractInvestmentFeatures()
InvestmentFeatures (20+ signals: savings_rate, runway_months,
    avg_jar_utilization, net_worth, asset_concentration, …)
    ↓ POST /api/agent/insight  trigger_type: "investment_nudge"
Agent M-Your (phân tích tự do, có toàn bộ product knowledge)
    ↓ { product_id, explanation, suggested_action }
Widget render product card từ product_id (m-sinh-loi / tiet-kiem / null)
```

**Agent quyết định mọi thứ**: chọn sản phẩm, viết giải thích, gợi ý hành động.
PFM chỉ cung cấp dữ liệu tài chính thực và render kết quả.

## Features gửi lên agent

| Nhóm | Features |
|---|---|
| Thanh khoản | `unallocated_balance`, `runway_months`, `runway_band` |
| Cashflow tháng này | `income_this_month`, `expense_this_month`, `net_this_month`, `fixed_expense_ratio` |
| Xu hướng MoM | `mom_expense_delta`, `mom_expense_pct` |
| Hũ | `avg_jar_utilization`, `jars_at_risk_count`, `jars_with_limit_count` |
| Tài sản ròng | `net_worth`, `assets_total`, `liabilities_total`, `asset_concentration`, `has_unknown_assets` |
| Tiết kiệm | `savings_rate` |
| Mục tiêu | `goal_count`, `avg_goal_completion` |

## Contract agent — investment_nudge

**Task prompt (server-owned):** Agent nhận bức tranh tài chính đầy đủ, tự quyết định sản phẩm phù hợp.

**Response schema:**
```json
{
  "snapshot_id": "<same as request>",
  "product_id": "m-sinh-loi" | "tiet-kiem" | null,
  "explanation": "<plain Vietnamese, no numbers>",
  "suggested_action": "<plain Vietnamese, no numbers>"
}
```

`product_id: null` → widget hiện explanation/suggested_action mà không show product card.

## Sản phẩm MSB (catalogue UI — không có selection logic)

| product_id | Tên | CTA |
|---|---|---|
| `m-sinh-loi` | M – Sinh lời | Xem thêm |
| `tiet-kiem` | Chứng chỉ tiền gửi MSB | Đăng ký |

## Các file đã thay đổi (chưa commit)

| File | Vai trò |
|---|---|
| `src/domain/engine/investment-nudge.ts` | Feature engineering: `extractInvestmentFeatures()` + `investmentFeaturesSnapshot()` |
| `src/domain/engine/__tests__/investment-nudge.test.ts` | 13 tests cho feature engine |
| `src/components/home/HomeInsightWidget.tsx` | Widget 3 mode — agent-driven |
| `src/components/home/HomeInsightWidget.test.tsx` | 11 tests (features, product cards, fallback, loading) |
| `src/lib/insight-api.ts` | `AgentInvestmentNarrative` (product_id), product catalogue, `requestInvestmentInsight` |
| `src/app/api/agent/insight/route.ts` | Validate InvestmentFeatures request + `product_id` response |
| `docs/HOME_INSIGHT_WIDGET.md` | Contract đầy đủ |

## Xác thực

- **131 test files / 1174 tests passed** (full suite).
- **`npx.cmd tsc --noEmit`**: passed.
- Feature engineering: 13 tests.
- Widget 3 mode: 11 tests.
- Jar-burn: 6 tests.

## Việc cần làm tiếp

1. **Backend**: `POST /insight` cần handle `trigger_type: "investment_nudge"`, đọc `metrics` (là `InvestmentFeatures`), dùng task prompt để phân tích, trả `product_id`.
2. **Test E2E** với CIF_0001 (surplus > 0 → investment nudge) và CIF_0002 (burn risk).
3. **Commit** tách riêng proactive insight khi ổn định.

## Lệnh

```powershell
cd 'D:\MSB Hackathon\pfm'
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
npm.cmd test -- --run src/components/home/HomeInsightWidget.test.tsx src/domain/engine/__tests__/investment-nudge.test.ts
npx.cmd tsc --noEmit
```
