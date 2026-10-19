# 01. TAXONOMY & DATA CONTRACTS (5-SLIDE CAROUSEL: PFM 1-3 + SECURITY 1-2)

## 1. Kiến trúc tổng thể mới
1. **Loại bỏ hoàn toàn Slide Health Score khỏi `HomeInsightWidget.tsx`**:
   - Nội dung Health Score đã nằm trong `/wrapped`.
   - Không xóa file `HealthScoreSheet.tsx` hay `health-score.ts`, chỉ ngừng render trên `HomeInsightWidget.tsx` và gán `healthAssessment: null` trong `src/lib/home-insight-service.ts`.
2. **Cơ cấu Carousel tối đa 5 Slides**:
   - Toàn bộ các slide trên `HomeInsightWidget` đều là Proactive Insights lấy từ `payload.secondaryInsights` (độ dài từ 2 đến 5).
   - **Quota Tài chính (`domain: 'PFM'`)**: Luôn từ **1 đến 3** insights.
   - **Quota Bảo mật (`domain: 'SECURITY'`)**: Luôn từ **1 đến 2** insights.
3. **Thứ tự hiển thị bắt buộc trên Carousel**:
   `[1. Bảo mật ĐỎ / VÀNG (0..2)]` -> `[2. Tài chính PFM theo mức độ ưu tiên (1..3)]` -> `[3. Bảo mật XANH (0..2)]`

---

## 2. Định nghĩa Types trong `src/insights/proactive/home-contract.ts`

```ts
export type InsightDomain = 'PFM' | 'SECURITY';
export type SecurityAlertLevel = 'RED' | 'AMBER' | 'GREEN';

export type InsightCategory =
  | 'UPCOMING_OBLIGATION' // 1. Nghĩa vụ sắp đến hạn
  | 'CASHFLOW_RISK'       // 2. Rủi ro dòng tiền
  | 'ANOMALY_LEAKAGE'     // 3. Bất thường & rò rỉ
  | 'GOAL_PROGRESS'       // 4. Tiến độ mục tiêu
  | 'OPTIMIZATION'        // 5. Cơ hội tối ưu
  | 'PERIODIC_PULSE'      // 6. Nhịp tiền định kỳ
  | 'RECOGNITION_RECAP'   // 7. Ghi nhận & nhìn lại
  | 'DISCOVERY_GUIDE'     // 8. Khám phá & hướng dẫn
  | 'SECURITY_RED'        // Cảnh báo bảo mật mức Đỏ (SC3, Hold, BT5/T7b)
  | 'SECURITY_AMBER'      // Cảnh báo bảo mật mức Vàng (BT4/T7a)
  | 'SECURITY_GREEN';     // Bảo mật mức Xanh (BT3, BT1, All-Clear)

export type InsightTone = 'urgent' | 'warning' | 'positive' | 'info' | 'security';

export type InsightPrimaryActionType =
  | 'navigate_pfm'
  | 'navigate_transfer'
  | 'navigate_goals'
  | 'navigate_wrapped'
  | 'navigate_security_hub'
  | 'open_jar_transfer'
  | 'open_auto_fund'
  | 'open_security_handbook'
  | 'open_emergency_contact'
  | 'request_msb_investigation'
  | 'mark_known_sender'
  | 'view_fraud_case'
  | 'chat_handoff'
  | 'dismiss';

export interface InsightActionChip {
  label: string;
  actionType: InsightPrimaryActionType;
  href?: string;
  prompt?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}
```

---

## 3. Mở rộng `CandidateInsight` và `HomeInsightCard`

Bổ sung các trường sau vào `CandidateInsight` (trong `snapshot.ts`) và `HomeInsightCard` (trong `home-contract.ts`):

```ts
export interface ReframedInsightExtensions {
  domain?: InsightDomain;              // 'PFM' | 'SECURITY'
  securityLevel?: SecurityAlertLevel;  // 'RED' | 'AMBER' | 'GREEN' (chỉ dành cho domain === 'SECURITY')
  scenarioCode?: 'BT1' | 'BT3' | 'BT4' | 'BT5' | 'SC3' | 'ALL_CLEAR';
  category?: InsightCategory;
  categoryLabel?: string;
  tone?: InsightTone;
  impactLine?: string;                 // Câu nhận định hệ quả / hành động ngắn dưới tiêu đề
  badgeText?: string;                  // VD: "Cảnh báo Đỏ", "Cảnh báo Vàng", "An toàn", "Còn 3 ngày"
  actionType?: InsightPrimaryActionType;
  actionHref?: string;
  actionLabel?: string;
  chips?: InsightActionChip[];         // Danh sách các chip hành động hiển thị trên thẻ & sheet
}
```

---

## 4. Quy tắc Validation trong `home-contract.ts`
- Cập nhật `validAgentSelection(value, allowedIds)`:
  - Cho phép `value.selected` có độ dài từ `1` đến `5` (`value.selected.length < 1 || value.selected.length > 5` mới trả về `false`).
- Cập nhật `fallbackPayload(snapshot)`:
  - Lấy tối đa 5 ứng viên từ `snapshot.candidates.slice(0, 5)` (đã được sắp xếp đúng thứ tự ở tầng snapshot).
  - Truyền đầy đủ `domain`, `securityLevel`, `scenarioCode`, `category`, `categoryLabel`, `tone`, `impactLine`, `badgeText`, `actionType`, `actionHref`, `actionLabel`, `chips` vào `secondaryInsights`.
  - Gán `healthAssessment: null`.