# 01. TAXONOMY & DATA CONTRACTS (PURE 3-INSIGHT CAROUSEL - NO HEALTH SCORE)

## 1. Mục tiêu Kiến trúc Mới
1. **Loại bỏ hoàn toàn Slide Health Score** (`HealthScoreSheet`, điểm `X/100`, 4 trụ cột) khỏi `HomeInsightWidget` trên màn hình Home (do phần này đã được đưa vào tính năng **Wrapped**).
2. **Chuyển đổi Carousel 3 Slide thành 3 Proactive Insights (Top 3 Candidates)** được tuyển chọn từ **8 Nhóm Insight chuẩn (Bảng 3)** kết hợp với **Security Hub**.
3. Mỗi thẻ Insight trên Carousel phải hiển thị:
   - **Category Pill** (Nhãn phân loại + Icon + Màu ngữ nghĩa).
   - **Headline (`title`)**: Sự kiện + Con số cụ thể.
   - **Impact Subline (`impactLine`)**: Câu nhận định hệ quả/khả năng đáp ứng ngay lập tức (VD: *"Số dư hiện đủ trả"*, *"Dưới ngưỡng an toàn 3 triệu"*).

## 2. Định nghĩa 8 Nhóm Insight (`InsightCategory`)

Cập nhật vào `src/insights/proactive/home-contract.ts`[cite: 1]:

```typescript
export type InsightCategory =
  | 'UPCOMING_OBLIGATION' // 1. Nghĩa vụ sắp đến hạn
  | 'CASHFLOW_RISK'       // 2. Rủi ro dòng tiền
  | 'ANOMALY_LEAKAGE'     // 3. Bất thường & rò rỉ
  | 'GOAL_PROGRESS'       // 4. Tiến độ mục tiêu
  | 'OPTIMIZATION'        // 5. Cơ hội tối ưu
  | 'PERIODIC_PULSE'      // 6. Nhịp tiền định kỳ
  | 'RECOGNITION_RECAP'   // 7. Ghi nhận & nhìn lại (Dẫn sang Wrapped)
  | 'DISCOVERY_GUIDE';    // 8. Khám phá & hướng dẫn (PFM + Security Hub)

export type InsightSlotRole =
  | 'SLOT_1_PROTECT'      // Nhóm 1, 2 (Nghĩa vụ đến hạn, Rủi ro dòng tiền, hoặc Security Hold khẩn)
  | 'SLOT_2_MONITOR'      // Nhóm 3, 4, 6 (Bất thường & rò rỉ, Tiến độ mục tiêu, Nhịp tiền định kỳ)
  | 'SLOT_3_GROW_GUIDE';  // Nhóm 5, 7, 8 (Cơ hội tối ưu, Ghi nhận & nhìn lại, Khám phá & Bảo mật)

export type InsightTone = 'urgent' | 'warning' | 'positive' | 'info' | 'security';

export type InsightPrimaryActionType =
  | 'navigate_pfm'           // Mở /pfm
  | 'navigate_transfer'      // Mở /transfer (thanh toán hóa đơn/thẻ)
  | 'navigate_goals'         // Mở /goals
  | 'navigate_wrapped'       // Mở /wrapped (Xem nhìn lại & Health Score trong Wrapped)
  | 'navigate_security_hub'  // Mở /settings (Security Hub)
  | 'open_jar_transfer'      // Mở chuyển tiền giữa các hũ
  | 'open_auto_fund'         // Mở cài đặt tự động chia tiền khi lương về
  | 'open_security_handbook' // Mở HandbookSheet (Cẩm nang bảo mật)
  | 'chat_handoff';          // Trao đổi với M-Your
3. Cấu trúc HomeInsightCard & Payload API mớiTrong src/insights/proactive/home-contract.ts[cite: 1]:Thay vì trả về secondaryInsights (2 phần tử) kèm healthScore, nay danh sách insight trả về tới 3 phần tử (insights: HomeInsightCard[] hoặc giữ alias secondaryInsights chứa tối đa 3 phần tử để tương thích ngược với code cũ).Không cần gọi LLM sinh healthAssessment nữa, tiết kiệm 50% token và giảm latency.TypeScriptexport interface HomeInsightActionSpec {
  type: InsightPrimaryActionType;
  label: string;          // VD: "Thanh toán ngay", "Rà soát khoản chi", "Xem hành trình Wrapped"
  href?: string;          // Đường dẫn đích nếu là navigate_*
  payload?: Record<string, string | number>;
}

export interface ReframedInsightFields {
  category: InsightCategory;
  categoryLabel: string;  // VD: "Nghĩa vụ sắp đến hạn", "Rủi ro dòng tiền"
  slotRole: InsightSlotRole;
  tone: InsightTone;
  impactLine: string;     // Câu "So what" (<= 80 ký tự), VD: "Số dư hiện đủ trả."
  badgeText?: string;     // VD: "Còn 3 ngày", "Đạt 50%", "+3 thuê bao"
  primaryAction: HomeInsightActionSpec;
}
4. Bảng Mapping Ngữ nghĩa UI 
#,InsightCategory,categoryLabel,slotRole ưu tiên,tone,Icon (lucide-react)
1,UPCOMING_OBLIGATION,Nghĩa vụ sắp đến hạn,SLOT_1_PROTECT,urgent,CalendarClock
2,CASHFLOW_RISK,Rủi ro dòng tiền,SLOT_1_PROTECT,warning,TrendingDown
3,ANOMALY_LEAKAGE,Bất thường & rò rỉ,SLOT_2_MONITOR,warning,AlertTriangle
4,GOAL_PROGRESS,Tiến độ mục tiêu,SLOT_2_MONITOR,positive,Target
5,OPTIMIZATION,Cơ hội tối ưu,SLOT_3_GROW_GUIDE,info,TrendingUp
6,PERIODIC_PULSE,Nhịp tiền định kỳ,SLOT_2_MONITOR,info,Activity
7,RECOGNITION_RECAP,Ghi nhận & nhìn lại,SLOT_3_GROW_GUIDE,positive,Trophy
8,DISCOVERY_GUIDE,Khám phá & Bảo mật,SLOT_3_GROW_GUIDE (hoặc SLOT_1 nếu có Hold),security / info,ShieldCheck / Sparkles