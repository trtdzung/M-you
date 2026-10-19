# 02. DETECTOR RULES (8 NHÓM) & THUẬT TOÁN PHÂN BỔ 3 SLIDE

## 1. Quy tắc 8 Detector trong `src/insights/proactive/snapshot.ts`

### 1. Nghĩa vụ sắp đến hạn (`UPCOMING_OBLIGATION`)
- **Trigger:** Thẻ tín dụng/khoản vay đến hạn $\le 7$ ngày (`payment:next7`), hóa đơn định kỳ sắp tới (`payment:bills`), hoặc sổ tiết kiệm sắp đáo hạn (`fd-store.ts`[cite: 1]).
- **Bắt buộc tính `impactLine`:** Đối chiếu số tiền cần trả với tổng số dư thanh toán (`casaBalance`):
  - Đủ trả: `"Số dư hiện đủ trả ({casaBalance})."`
  - Thiếu tiền: `"Số dư hiện thiếu khoảng {shortfall} để thanh toán."`
- **Ví dụ:** *"Sao kê thẻ 8,2 triệu đến hạn ngày 25. Số dư hiện đủ trả."*
- **Action:** `{ type: 'navigate_transfer', label: 'Thanh toán ngay', href: '/transfer' }`.

### 2. Rủi ro dòng tiền (`CASHFLOW_RISK`)
- **Trigger:**
  - Dự báo thiếu hụt cuối tháng (`cashflow:end_of_month_risk`): Dựa trên nhịp chi trung bình ngày $\times$ số ngày còn lại trong tháng. Nếu số dư cuối tháng dự kiến $< 3.000.000\text{đ}$ (ngưỡng an toàn).
  - Áp lực hũ chi tiêu (`spending:jar:*`): Hũ cần bù tiền (`needs_cover`), vượt hạn mức (`over_limit_covered`), sắp cạn (`near_limit`), hoặc tốc độ tiêu vượt nhịp (`burn_risk`).
- **Ví dụ:** *"Với nhịp chi hiện tại, cuối tháng bạn còn khoảng 1,4 triệu, dưới ngưỡng an toàn 3 triệu."*
- **Action:** `{ type: 'navigate_pfm', label: 'Kiểm soát dòng tiền', href: '/pfm' }`.

### 3. Bất thường & rò rỉ (`ANOMALY_LEAKAGE`)
- **Trigger:**
  - Nhóm chi tăng $> 30\%$ so với tháng trước (`spending:month`) hoặc chi hôm nay tăng đột biến $> 1.5\times$ (`spending:today`).
  - Thuê bao/khoản chi định kỳ mới hoặc cộng dồn (`leakage:subscriptions`): Quét các khoản `recurringBills` phát sinh trong tháng.
  - Chi lặt vặt cộng dồn (`leakage:micro_spend`): Giao dịch nhỏ $< 100.000\text{đ}$ lặp lại nhiều lần.
  - Hoàn tiền vừa ghi nhận (`refund`).
- **Ví dụ:** *"Tháng này bạn có 3 thuê bao định kỳ, tổng 487 nghìn/tháng."*
- **Action:** `{ type: 'navigate_pfm', label: 'Soát các khoản rò rỉ', href: '/pfm' }`.

### 4. Tiến độ mục tiêu (`GOAL_PROGRESS`)
- **Trigger:** Quét danh sách `goals` (đạt mốc $25\%, 50\%, 75\%, 100\%$ hoặc đang chậm tiến độ).
- **Ví dụ:** *"Mục tiêu '{goal.name}' đã đạt {pct}% kế hoạch ({current}/{target})."*
- **Action:** `{ type: 'navigate_goals', label: 'Xem mục tiêu', href: '/goals' }`.

### 5. Cơ hội tối ưu (`OPTIMIZATION`)
- **Trigger:**
  - Tiền nhàn rỗi nằm im trong tài khoản thanh toán (`investment:discovery` / `surplus.ts`[cite: 1]).
  - Tiền chưa phân bổ vào hũ (`allocation:pool` $\ge 100.000\text{đ}$).
- **Ví dụ:** *"12 triệu đang nhàn rỗi trong tài khoản thanh toán sau khi đã trừ quỹ dự phòng."*
- **Action:** `{ type: 'chat_handoff', label: 'Tối ưu cùng M-Your' }` hoặc `{ type: 'navigate_pfm', label: 'Phân bổ tiền dư', href: '/pfm' }`.

### 6. Nhịp tiền định kỳ (`PERIODIC_PULSE`)
- **Trigger:**
  - Brief tuần (`pulse:weekly_brief`): Tổng chi 7 ngày qua so với nhịp tuần chuẩn + số hóa đơn sắp tới.
  - Lương về và đã chia hũ (`pulse:salary_in`).
- **Ví dụ:** *"7 ngày qua chi 3,1 triệu, thấp hơn nhịp 12%. Tuần tới có 2 hóa đơn."*
- **Action:** `{ type: 'navigate_pfm', label: 'Xem nhịp chi tiêu', href: '/pfm' }`.

### 7. Ghi nhận & nhìn lại (`RECOGNITION_RECAP`)
- **Trigger:** Tích lũy kỳ này khả quan, hoặc duy trì kỷ luật không vượt ngân sách hũ. Vì Health Score đã chuyển sang Wrapped, insight này đóng vai trò **cầu nối tự nhiên dẫn người dùng sang xem Wrapped & Health Score**!
- **Ví dụ:** *"Kỳ này bạn tích lũy được {savedAmount}, giữ vững kỷ luật ngân sách. Xem tổng kết & Sức khỏe tài chính ngay!"*
- **Action:** `{ type: 'navigate_wrapped', label: 'Mở nhìn lại (Wrapped)', href: '/wrapped' }`.

### 8. Khám phá & hướng dẫn (`DISCOVERY_GUIDE` - Tích hợp Security Hub)
- **Trigger 8A - Bảo mật đúng lúc (Security Hub từ `src/lib/security/`[cite: 1]):**
  - Có giao dịch đang tạm giữ (`holds.ts`[cite: 1]) $\rightarrow$ Đẩy lên `SLOT_1_PROTECT` (`tone: 'urgent'`).
  - Điểm bảo mật `securityScore < 80` hoặc chưa có Người liên hệ khẩn cấp (`emergencyContact`), hoặc có sổ tiết kiệm sắp đáo hạn cần lưu ý chống lừa đảo mạo danh $\rightarrow$ Sinh candidate `security:guide` (`tone: 'security'`).
  - **Action:** `{ type: 'open_security_handbook', label: 'Mở cẩm nang bảo mật' }` hoặc `{ type: 'navigate_security_hub', label: 'Mở Security Hub', href: '/settings' }`.
- **Trigger 8B - Gợi ý tính năng PFM (`discovery:auto_fund`):**
  - Khách hay chia tiền thủ công hoặc còn tiền chưa chia hũ $\rightarrow$ *"Bạn hay chia tiền tiết kiệm thủ công đầu tháng. Muốn M-Your tự làm khi lương về không?"*
  - **Action:** `{ type: 'navigate_pfm', label: 'Cấu hình chia hũ', href: '/pfm' }`.

---

## 2. Thuật toán Phân bổ 3 Slide (`selectTop3DiverseCandidates`)

Khi đã bỏ Health Score, cả 3 Slide trên `HomeInsightWidget`[cite: 1] đều là Insight. Để 3 Slide luôn mang lại giá trị cao nhất và không bị trùng lặp:
1. **Slide 1 (Slot 1 - Bảo vệ & Khẩn cấp):** Chọn ứng viên có mức ưu tiên cao nhất thuộc `SLOT_1_PROTECT` (`UPCOMING_OBLIGATION`, `CASHFLOW_RISK`, hoặc Security Hold). Nếu người dùng hoàn toàn không có rủi ro nào, lấy ứng viên tốt nhất của `SLOT_2_MONITOR`.
2. **Slide 2 (Slot 2 - Theo dõi Nhịp tiền, Rò rỉ & Mục tiêu):** Chọn ứng viên tiếp theo có `category` **KHÁC** Slide 1, ưu tiên `SLOT_2_MONITOR` (`ANOMALY_LEAKAGE`, `PERIODIC_PULSE`, `GOAL_PROGRESS`).
3. **Slide 3 (Slot 3 - Tối ưu, Ghi nhận & Khám phá/Bảo mật):** Chọn ứng viên tiếp theo có `category` **KHÁC** Slide 1 và Slide 2, ưu tiên `SLOT_3_GROW_GUIDE` (`OPTIMIZATION`, `RECOGNITION_RECAP`, `DISCOVERY_GUIDE`).
4. **Cơ chế Fallback bảo đảm luôn đủ 3 Slide:** Nếu danh sách ứng viên thực tế $< 3$, hệ thống tự động bổ sung các thẻ mặc định hữu ích từ `PERIODIC_PULSE` (Nhịp chi tiêu tuần), `RECOGNITION_RECAP` (Dẫn sang `/wrapped` để xem Health Score & Tổng kết kỳ), và `DISCOVERY_GUIDE` (Mẹo bảo mật Security Hub) để Carousel 3 Slide luôn đầy đặn.