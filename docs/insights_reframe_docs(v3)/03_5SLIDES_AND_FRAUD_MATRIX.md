# 03. CƠ CẤU CAROUSEL 5 SLIDES (NO HEALTH SCORE) & MA TRẬN AI AGENT FRAUD TRÊN HOME

## 1. Kiến trúc Hiển thị trên `HomeInsightWidget`
- **Loại bỏ Health Score khỏi HomeWidget**: Đã có trong `/wrapped`.
- **Tổng số lượng Slide**: Từ **2 đến tối đa 5 insights** trên Carousel:
  - **Tài chính (PFM)**: Luôn có từ **1 đến 3** insights (theo mức độ ưu tiên từ Bảng 3).
  - **Bảo mật (Security)**: Luôn có từ **1 đến 2** insights.
- **Thứ tự sắp xếp bắt buộc trên Carousel**:
  `[1. Bảo mật ĐỎ / VÀNG (0..2)]` $\rightarrow$ `[2. Tài chính PFM (1..3)]` $\rightarrow$ `[3. Bảo mật XANH (0..2)]`
- **Fallback Bảo mật Xanh (`security:all_clear`)**: Nếu người dùng không có bất kỳ cảnh báo bảo mật nào kích hoạt, luôn hiển thị 1 thẻ Xanh ở cuối Carousel báo tài khoản đang được Khiên bảo vệ M-Your canh gác an toàn.

## 2. Ma trận Kịch bản Bảo mật (Security / Fraud) trên Home Insight

| Mã Kịch bản | ID Candidate | Cấp độ (`securityLevel`) | Vị trí trên Carousel | Điều kiện kích hoạt (Trigger) | Nội dung hiển thị chuẩn (`title` + `impactLine`) | Action Chips |
|---|---|---|---|---|---|---|
| **SC3 / Hold** | `security:sc3_active_case` | **ĐỎ (`RED`)** | Đầu tiên (Trước PFM) | Có lệnh Hold (`holds.ts`) hoặc hồ sơ sự cố trong 30 ngày (`case-store.ts`) | **Title:** "Hồ sơ của bạn đang được xử lý."<br>**Impact:** "Lưu ý: bất kỳ ai đề nghị 'hỗ trợ lấy lại tiền' có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app này." | `[Xem trạng thái hồ sơ]` |
| **BT5 (T7b)** | `security:bt5_large_unknown_inflow` | **ĐỎ (`RED`)** | Đầu tiên (Trước PFM) | Nhận khoản lớn ($\ge 10$ triệu hoặc gấp 3x TB) từ TK lạ, không khớp mẫu lương | **Title:** "Bạn vừa nhận {amount} từ tài khoản lạ."<br>**Impact:** "Nếu có người báo chuyển nhầm và nhờ chuyển trả vào tài khoản khác, đừng làm. MSB sẽ tra soát và hoàn trả về đúng tài khoản gốc." | `[Yêu cầu MSB tra soát]` · `[Tôi biết khoản này]` |
| **BT4 (T7a)** | `security:bt4_bait_inflow` | **VÀNG (`AMBER`)** | Đầu tiên (Sau Đỏ, trước PFM) | Trong 2 ngày, nhận $\ge 3$ khoản nhỏ liên tiếp từ cùng 1 TK lạ | **Title:** "Bạn vừa nhận {lastAmount} từ tài khoản lạ."<br>**Impact:** "Nếu đây là 'hoa hồng làm nhiệm vụ', đó thường là bước mồi của lừa đảo." | `[Xem thủ đoạn]` · `[Tôi biết người này]` |
| **BT3** | `security:bt3_high_balance` | **XANH (`GREEN`)** | Cuối cùng (Sau PFM) | Nhận $\ge 50$ triệu (hoặc số dư $\ge 50$ triệu) & chưa có người thân khẩn cấp | **Title:** "Khoản {amount} vừa về. Thêm người thân khẩn cấp để bảo vệ tài khoản."<br>**Impact:** "Luôn có người thân cùng bạn kiểm tra khi phát sinh giao dịch bất thường." | `[Thêm người thân]` · `[Tự khóa chuyển tiền]` · `[Để sau]` |
| **BT1 / BT2** | `security:bt1_onboarding` | **XANH (`GREEN`)** | Cuối cùng (Sau PFM) | KH mới làm quen (7 ngày đầu) hoặc điểm bảo mật $< 80$ | **Title:** "Bạn đã biết những phương thức bảo mật của MSB chưa?"<br>**Impact:** "Điểm bảo mật: {score}/100. Bật mã chống giả mạo và thêm người thân khẩn cấp để lên mức Cao." | `[Xem 3 thủ đoạn phổ biến]` · `[Trung tâm bảo mật]` |
| **ALL_CLEAR** | `security:all_clear` | **XANH (`GREEN`)** | Cuối cùng (Sau PFM) | Không có bất kỳ cảnh báo bảo mật nào ở trên | **Title:** "Tài khoản đang được Khiên bảo vệ M-Your canh gác 24/7."<br>**Impact:** "Mọi giao dịch và đăng nhập gần đây đều an toàn, không phát hiện dấu hiệu bất thường." | `[Trung tâm bảo mật]` · `[Xem 3 thủ đoạn phổ biến]` |