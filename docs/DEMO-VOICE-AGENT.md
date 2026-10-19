# Demo: nói nhu cầu, xác nhận hành động, hiểu chi tiêu

Kịch bản 6–8 phút, dựa trên local code ngày 23/09/2026. Persona: **Ly Lã — Lương ổn định (CIF_0001)**. Tên trợ lý hiện trên UI là **M-You**; yêu cầu sản phẩm gọi M-Your. Đây là kịch bản, chưa phải biên bản rehearsal với STT/model thật.

## Chuẩn bị

- Mở Home và chọn đúng persona; cấp quyền microphone, thử STT và kết nối agent một lần trước khi trình bày.
- Nút trợ lý Home/PFM: **giữ khi nói, thả khi xong**; transcript cuối tự gửi sang agent để lập đề xuất. Trong màn hình Chat, giọng nói điền ô soạn và người dùng **bấm Gửi**.
- Danh bạ local CIF_0001 có **Nguyễn Thị Lan — MSB**, **Trần Văn Bình — Vietcombank**, **Chủ nhà Phạm Văn Đức — MSB**. Kiểm tra bên agent cũng đọc được cùng danh bạ.
- Hũ local: Thiết yếu, Ăn uống, Di chuyển, Hưởng thụ, Sức khỏe, Tiết kiệm. Tiết kiệm chưa có hạn mức; không chọn làm hũ đích trong demo cân đối.
- Ghi lại số dư khả dụng của Ăn uống và Hưởng thụ. Dùng số chuyển 300.000đ khi nguồn đủ; nếu không, giảm xuống 100.000đ hoặc chọn nguồn khác. Hạn mức không phải số dư khả dụng.
- Chỉ xác nhận trên môi trường demo. Prototype hiện **không có OTP** và không chứng minh tiền được chuyển qua ngân hàng thật.
- Rehearsal cũng làm thay đổi dữ liệu demo; trước lần trình bày tiếp theo cần kiểm tra lại số dư.

## Hai điều kiện để demo trọn vẹn

**Dữ liệu tháng đang lệch trong local code:** PFM dùng ngày demo **15/09/2026**, còn `personal-pfm-agent/data/customers/CIF_0001.json` mới đến **29/08/2026**, có tổng hợp tháng 6/7/8. Chatbot nhận ngày thực tế. Vì vậy, cần đồng bộ dữ liệu trước khi trình bày câu “tháng này và tháng trước” như một luồng đã hoạt động đúng cho tháng 9/8. Có kịch bản thay thế tháng 8/7 bên dưới; không đổi nhãn tháng để che thiếu dữ liệu.

**Agent và UI cần cùng môi trường:** `tools/customer_data_tools.py` đang đọc hũ/danh bạ từ PFM remote, trong khi UI local ghi SQLite local. Trước demo cần dùng chung môi trường hoặc đồng bộ đường đọc. Nếu chưa, không hứa agent thấy ngay giao dịch/hũ vừa thay đổi trên localhost.

## 0. Mở đầu — 20 giây

**Màn hình:** Home.

> Tôi sẽ thực hiện ba việc thường gặp: tạo giao dịch bằng giọng nói, cân đối tiền giữa các hũ, và hỏi trợ lý xem chi tiêu tháng này khác tháng trước ở đâu.

## 1. Voice tạo giao dịch chuyển tiền — 1 phút 30 giây

Giữ nút trợ lý và nói:

> Chuyển cho Nguyễn Thị Lan ba trăm nghìn đồng, nội dung tiền ăn trưa.

**Thao tác và kết quả cần thấy:**

1. Thả nút, đợi transcript cuối và thẻ **Đề xuất chuyển tiền**.
2. Kiểm tra đúng người nhận, MSB, **300.000đ**, nội dung. Nếu nhiều người trùng tên, chọn theo câu hỏi làm rõ. Không ứng biến số tài khoản mới.
3. Bấm **Chuyển**. Form chuyển tiền được điền sẵn; chọn nguồn có đủ số dư. Nếu muốn gắn khoản chi với hũ, chọn nguồn/danh mục phù hợp với Ăn uống.
4. Bấm **Tiếp tục** → rà soát → **Xác nhận chuyển tiền** → xem màn hình kết quả.
5. Mở danh sách giao dịch, kiểm tra đúng một giao dịch mới với người nhận/số tiền đã xác nhận và thay đổi số dư nguồn.

**Lời dẫn:**

> Tôi chỉ nói nhu cầu. Trợ lý tìm người nhận đã lưu và chuẩn bị biểu mẫu. Giao dịch chỉ được ghi khi khách hàng kiểm tra rồi xác nhận.

Chưa xác nhận thì chưa có giao dịch. Không mặc định tổng chi tăng đúng 300.000đ nếu giao dịch vẫn là chuyển khoản chưa gắn danh mục; kiểm tra phân loại thực tế. “Tạo giao dịch” trong kịch bản này là chuyển tiền qua form, không phải yêu cầu agent tự ghi một khoản chi tiền mặt.

## 2. Voice chuyển/cân đối tiền giữa hũ — 1 phút 30 giây

### Lệnh trực tiếp để rehearsal

> Chuyển ba trăm nghìn đồng từ hũ Hưởng thụ sang hũ Ăn uống trong tháng này. Giữ nguyên hạn mức của hai hũ.

Nếu xuất hiện thẻ **Đề xuất chia tiền giữa các hũ**, kiểm tra đúng nguồn, đích, số tiền rồi bấm **Áp dụng**.

**Giới hạn hiện tại:** speech có nhận diện ý định chuyển hũ, nhưng policy agent chủ yếu dành cho **bù phần thiếu**, ưu tiên tiền chưa phân bổ trước rồi các hũ có số dư lớn. Chưa bảo đảm lệnh chọn tùy ý hai hũ luôn được trả đúng form. Chỉ dùng lệnh trực tiếp làm cảnh chính nếu rehearsal đã qua.

### Kịch bản phù hợp hơn với luồng hiện có

1. Xem hũ Ăn uống còn **X** đồng. Chuẩn bị số tiền định chi **A = X + 300.000đ**.
2. Giữ nút và nói, thay `[A]` bằng số tiền cụ thể:

   > Tôi định chi [A] đồng tiền ăn uống nhưng hũ không đủ. Hãy đề xuất cân đối phần còn thiếu trong tháng này, giữ nguyên hạn mức.

3. Agent đề xuất lấy thêm **300.000đ** từ tiền chưa phân bổ hoặc các hũ đủ tiền.
4. Để minh họa **hũ sang hũ**, chỉnh nguồn trên form sang **Hưởng thụ** nếu đủ tiền, để **300.000đ**, bấm **Áp dụng**. Nói rõ khách hàng vừa chỉnh lại lựa chọn của agent.
5. Kiểm tra hũ nguồn giảm 300.000đ, hũ nhận tăng 300.000đ. **Hạn mức tháng không đổi; tổng thu/chi và tổng tiền khách hàng không tăng do cân đối nội bộ.**

**Lời dẫn:**

> Tôi có thể cân đối số dư giữa các hũ mà không phải đổi kế hoạch hạn mức tháng. Trợ lý đề xuất, khách hàng vẫn được chỉnh lại trước khi áp dụng.

**Cảnh phụ nếu còn thời gian:** nói “Chuyển từ hũ Hưởng thụ sang hũ Ăn uống” mà không nêu số tiền. Nếu STT nhận intent thiếu amount, UI hỏi bổ sung và không tự thực hiện. Không dùng hũ chưa đặt hạn mức hoặc hũ nguồn thiếu tiền cho cảnh thành công.

## 3. Hỏi về chi tiêu tháng này và tháng trước — 2 phút

Chọn **Chuyển qua Chat** để đủ chỗ xem giải thích và biểu đồ.

### Sau khi đồng bộ dữ liệu tháng 9/8

**Câu chính:**

> Tháng này tôi đã chi bao nhiêu? So với tháng trước tăng hay giảm, và ba nhóm chi tiêu lớn nhất là gì?

Kết quả cần thấy: kỳ dữ liệu rõ ràng, tổng chi, chênh lệch, nhóm chi nổi bật. Không coi tiền chuyển hũ nội bộ là khoản chi mới.

**Câu tiếp theo — so sánh công bằng:**

> Hãy so sánh từ ngày một đến ngày mười lăm tháng chín năm hai nghìn không trăm hai mươi sáu với cùng kỳ tháng tám. Cho tôi biểu đồ nếu đủ dữ liệu.

Kết quả cần thấy: cùng số ngày **1–15/9 so với 1–15/8**. Nếu chỉ có tổng tháng, agent phải nói chưa đủ chi tiết để tính cùng kỳ, không nội suy thành dữ liệu thật. Biểu đồ phụ thuộc agent trả chart hợp lệ; bảng/chữ vẫn có thể dùng để kiểm tra số liệu.

**Câu nối sang hành động:**

> Nếu muốn giảm năm trăm nghìn đồng chi tiêu trong phần còn lại của tháng, tôi nên xem lại nhóm nào trước? Hãy dựa vào các khoản chi đã có.

**Lời dẫn:**

> Trợ lý giúp hiểu nhóm chi nào thay đổi và tìm khoản có thể điều chỉnh. So sánh cần cùng kỳ và cần nói rõ khi thiếu dữ liệu.

### Phương án dùng với fixture local hiện có

Nếu chưa đồng bộ tháng 9, thay câu chính bằng:

> Theo dữ liệu đang có, hãy so sánh chi tiêu tháng tám năm hai nghìn không trăm hai mươi sáu với tháng bảy. Nêu rõ tháng tám mới có dữ liệu đến ngày nào, không suy đoán chi tiêu tháng chín.

Mốc đối chiếu fixture **CIF_0001**:

| Kỳ | Tổng chi trong file agent |
| --- | ---: |
| Tháng 7/2026 | 20.814.000đ |
| Tháng 8/2026, đến 29/8 | 14.184.000đ |
| Chênh tổng đã ghi nhận | 6.630.000đ |

Đây là tháng 8 chưa kết thúc so với cả tháng 7. Không kết luận tỷ lệ tiết kiệm của hai tháng đầy đủ. Các số thuộc fixture chatbot, chưa được xác nhận khớp UI local.

Nếu vẫn hỏi “tháng này” khi thiếu tháng 9, câu trả lời đúng là nêu thiếu dữ liệu. Đó là demo xử lý thiếu dữ liệu, không phải demo phân tích thành công tháng 9.

## 4. Nối với proactive insight — tùy chọn 40 giây

1. Về Home, chạm dòng gợi ý nhỏ dưới thẻ tài khoản.
2. Xem số liệu, ngày dữ liệu, chọn **Xem cụ thể cùng M-Your** nếu là insight chi tiêu.
3. Chat mở với câu hỏi và bối cảnh điền sẵn; xem lại rồi bấm gửi.

> Ứng dụng còn có thể chủ động đưa một gợi ý nhỏ ở Home. Khi khách hàng muốn hiểu thêm, bối cảnh đi cùng vào cuộc trò chuyện.

Endpoint insight mới đã có code/test nhưng chưa xác nhận model thật vì thiếu khóa model local. Nếu đang dùng fallback, gọi đó là gợi ý từ dữ liệu, không nói câu chữ vừa do model tạo. Chỉ đưa cảnh này vào demo khi Home đã chạy và thấy widget.

## Nhịp demo và dự phòng

| Thời gian | Cảnh |
| --- | --- |
| 00:00–00:20 | Mở đầu |
| 00:20–01:50 | Voice → đề xuất chuyển tiền → xác nhận → giao dịch |
| 01:50–03:20 | Voice cân đối hũ → kiểm tra/chỉnh nguồn → áp dụng |
| 03:20–05:20 | Chi tiêu → so sánh cùng kỳ → gợi ý điều chỉnh |
| 05:20–06:00 | Insight Home → Chat, nếu sẵn sàng |
| 06:00–06:20 | Kết: “Nói nhu cầu, kiểm tra đề xuất, xác nhận và hiểu tác động.” |

- STT lỗi: sửa/nhập câu đã chuẩn bị và nói rõ đang tiếp tục bằng văn bản.
- Agent chậm: chờ một lần, tránh gửi trùng. Có thể mở video rehearsal nhưng phải nói rõ đó là bản ghi.
- Hũ nguồn thiếu: giảm số tiền hoặc chọn nguồn đủ, không che trạng thái hiện tại.
- Chưa có tháng 9: dùng tháng 8/7 có nhãn kỳ rõ ràng hoặc demo cách trợ lý báo thiếu dữ liệu.
