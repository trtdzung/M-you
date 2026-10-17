# Trang chủ: Proactive Insight Widget

Widget luôn hiển thị ngay dưới thẻ tài khoản chính sau đăng nhập. Có ba trạng thái ưu tiên theo thứ tự:

| Ưu tiên | Điều kiện | Hiển thị |
|---|---|---|
| 1 | Hũ chi tiêu linh hoạt có nguy cơ cạn trước cuối tháng | **Cảnh báo hũ sắp cạn** + gọi agent |
| 2 | Không có rủi ro hũ + surplus ≥ 500 K VND | **Gợi ý đầu tư** (M–Sinh lời hoặc CCTKH) + gọi agent |
| 3 | Không có rủi ro hũ + surplus < 500 K hoặc không xác định | **Đang theo dõi** (không gọi agent) |

PFM tính toán hoàn toàn từ dữ liệu hiện có và tự quyết định loại insight. Agent backend chỉ bổ sung phần **diễn giải văn bản** — không số liệu, không giao dịch mới.

---

## 1. Cảnh báo hũ sắp cạn (`trigger_type: "jar_burn"`)

### Cách tính (xem `jar-burn-forecast.ts`)

- Chỉ xét tháng demo hiện tại và hũ có số dư dương (`remaining > 0`).
- Hũ chứa danh mục `fixed` bị bỏ qua (tránh cảnh báo sai từ tiền nhà trả một lần).
- Chi tiêu ròng: `0.6 × chi7ngày/7 + 0.4 × chi30ngày/30`.
- Chỉ phát cảnh báo khi có giao dịch trên ≥ 3 ngày khác nhau trong 30 ngày.
- Nếu `R × D > B`: `daysToEmpty = floor(B/R)`, `safeDailySpend = floor(B/D)`.
- Chọn hũ ưu tiên: mức `urgent` trước, rồi hũ `essential`, rồi thiếu hụt dự kiến cao nhất.
- CIF_0002 trong seed data kích hoạt cảnh báo hũ **Hưởng thụ** tại ngày demo 15/09/2026.

### Contract agent (`jar_burn`)

**Request PFM gửi lên:**
```json
{
  "user_id": "CIF_0002",
  "insight_id": "jarBurn:lifestyle",
  "snapshot_id": "<stable key>",
  "trigger_type": "jar_burn",
  "as_of": "2026-09-15T00:00:00.000Z",
  "metrics": {
    "jar_id": "lifestyle",
    "jar_label": "Hưởng thụ",
    "severity": "attention",
    "period_end": "2026-09-30T16:59:59.999Z",
    "balance": 500000,
    "days_remaining": 15,
    "daily_burn": 45000,
    "safe_daily_spend": 33333,
    "days_to_empty": 11,
    "projected_shortfall": 175000,
    "active_days": 5,
    "source": "estimated"
  },
  "task": "...server-owned Vietnamese instruction..."
}
```

**Response agent trả:**
```json
{
  "snapshot_id": "<same key>",
  "explanation": "Chi tiêu hưởng thụ gần đây đang vượt mức an toàn so với số tiền còn lại trong hũ.",
  "suggested_action": "Bạn có thể cân nhắc giảm các khoản chi hưởng thụ trong tuần tới để hũ đủ đến cuối tháng."
}
```

---

## 2. Gợi ý đầu tư (`trigger_type: "investment_nudge"`)

### Cách tính (xem `investment-nudge.ts`)

- Chỉ tính khi không có rủi ro hũ.
- `investableAmount = max(0, unallocatedPool.amount)` — tiền CASA chưa gán hũ.
- Ngưỡng tối thiểu để hiển thị: **500 K VND**.
- Lựa chọn sản phẩm:
  - `investableAmount < 5 M` → **M–Sinh lời** (3,6%/năm, rút linh hoạt 24/7)
  - `investableAmount ≥ 5 M` → **Chứng chỉ tiền gửi MSB** (6,9%/năm, chuyển nhượng được)
- `estimatedDailyReturn = round(amount × rate / 365)`
- `estimatedMonthlyReturn = round(amount × rate / 12)`
- Ước tính này chỉ dùng để minh hoạ tiềm năng — không phải cam kết lãi suất.

### Sản phẩm đầu tư MSB

| Sản phẩm | Lãi suất | Tính năng | CTA |
|---|---|---|---|
| **M–Sinh lời** | 3,6%/năm | Tự động sinh lời, sinh lời hơn mỗi ngày, rút 24/7 | Xem thêm |
| **Chứng chỉ tiền gửi MSB** | đến 6,9%/năm | Sinh lời cao, linh hoạt chuyển nhượng, giao dịch online | Đăng ký |

### Contract agent (`investment_nudge`)

**Request PFM gửi lên:**
```json
{
  "user_id": "CIF_0001",
  "insight_id": "invest:m-sinh-loi",
  "snapshot_id": "<stable key>",
  "trigger_type": "investment_nudge",
  "as_of": "2026-09-15T00:00:00.000Z",
  "metrics": {
    "product_id": "m-sinh-loi",
    "product_label": "M – Sinh lời",
    "investable_amount": 2000000,
    "annual_rate_bps": 360,
    "estimated_daily_return": 197,
    "estimated_monthly_return": 6000,
    "source": "estimated"
  },
  "task": "...server-owned Vietnamese instruction..."
}
```

**Response agent trả:**
```json
{
  "snapshot_id": "<same key>",
  "explanation": "Bạn đang có khoản tiền chưa phân bổ vào hũ nào — đây là cơ hội để số tiền này tự sinh lời.",
  "suggested_action": "Kích hoạt M–Sinh lời để số tiền nhàn rỗi tự động sinh lời mỗi ngày mà vẫn rút được bất cứ lúc nào."
}
```

---

## Quy tắc chung cho agent

- **Không chứa chữ số** trong `explanation` và `suggested_action`. Widget tự hiển thị tất cả số liệu từ PFM.
- **Không ghi vào lịch sử chat** — đây là luồng hoàn toàn tách biệt với chat/STT.
- Phải trả đúng `snapshot_id` từ request.
- Timeout proxy: **6 giây**. Nếu lỗi hoặc timeout, widget hiển thị nội dung dự phòng deterministic.
- Proxy từ chối response sai schema hoặc có số trong văn bản (HTTP 502).

## Endpoint upstream

```
POST ${AGENT_INSIGHT_API_URL}            # nếu đặt biến này
POST ${AGENT_API_BASE_URL}/insight       # fallback
```

Headers: `X-API-Key`, optionally `Authorization: Bearer <auth0_token>`.

## Giới hạn pha này

- `unallocatedPool.amount = "unknown"` (không có tài khoản `current`) → không gợi ý đầu tư.
- Lãi suất hardcode trong `INVESTMENT_PRODUCTS` để demo; pha sau có thể fetch từ product API.
- `DEMO_NOW` cố định ở 15/09/2026. Agent dùng `as_of` từ request, không dùng đồng hồ server.
- Cảnh báo thẻ tín dụng và safe surplus chưa kích hoạt.
