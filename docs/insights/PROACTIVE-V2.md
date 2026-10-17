# Home proactive insight — snapshot v2

Cập nhật 23/09/2026. Tài liệu này mô tả implementation mới trong `pfm` và `personal-pfm-agent`; các tài liệu P1/P2/P4 cũ trong cùng thư mục là lịch sử prototype.

## Luồng đang triển khai

1. Home `/` sau đăng nhập tải dữ liệu như trước. Widget nằm dưới thẻ tài khoản, trước lưới chức năng: một hàng khoảng 56px, chỉ một insight. Không thay vị trí hay xóa chức năng cũ. Khi thu gọn không lộ số tiền; chạm mới mở chi tiết bằng Sheet có sẵn.
2. Widget chờ profile tài sản/nợ/mục tiêu, hũ và corrections tải xong. Gửi CIF demo, các bản ghi người dùng khai báo và topup trong phiên tới `POST /api/proactive-insights/current`. Đổi persona hủy request cũ và chặn hiển thị kết quả khác persona.
3. Server đọc tài khoản, giao dịch ngân hàng, giao dịch thủ công, categories, corrections, cấu hình hũ từ SQLite. Ghép fixture tài sản/nợ/mục tiêu với profile hợp lệ từ browser; không nhận browser tự sửa số dư ngân hàng.
4. `financial-snapshot-service.ts` tạo snapshot bằng `buildCustomerSnapshot` và bộ tính `computeFinancials` dùng chung với UI. Hash SHA-256 chứa CIF, nội dung snapshot và phiên bản policy.
5. Nếu cache/dismiss không áp dụng, toàn bộ snapshot đã chuẩn hóa được POST tới agent `/proactive-insights`. Agent stateless đọc few-shot prompt, chọn candidate ưu tiên và viết title/body. Không dùng memory, không gọi các công cụ giao dịch.
6. Server kiểm tra snapshot ID, candidate ID, priority và giới hạn copy. UI lấy số tiền/CTA từ candidate của bộ tính, không từ LLM. Lỗi/timeout/schema sai → copy dự phòng từ candidate.
7. Mở chi tiết: số liệu, nhãn ước tính, ngày dữ liệu và CTA. Khoản sắp trả có `Xem tổng quan` → `/pfm`. Các CTA M-Your lưu bản nháp theo CIF trong sessionStorage, mở `/pfm?assistant=1&insight=1`; composer nhận câu hỏi + metric + facts + ngày dữ liệu. Người dùng bấm gửi qua endpoint chat cũ. Không tự gửi hoặc thực hiện phân bổ/đầu tư.

## Dữ liệu snapshot

| Domain | Nội dung / nguồn |
| --- | --- |
| accounts | Số dư, số dư khả dụng, loại, nguồn, thời điểm cập nhật; bỏ số tài khoản, thông tin thụ hưởng |
| transactions | Ngân hàng + thủ công, sau corrections/ẩn giao dịch; có refund, transfer, trạng thái và nguồn |
| cashflow | Ngày hiện tại, từ đầu tháng, cùng số ngày tháng trước, 30 ngày, 6 tháng |
| spendingByCategory | Tổng chi theo danh mục, tính từ toàn bộ lịch sử đủ điều kiện |
| jars, budgets | Hạn mức, đã chi, còn lại, tiền điều chuyển, ước tính burn, độ phủ lịch sử |
| unallocated | Pool theo cùng công thức với UI, có thể unknown hoặc âm |
| assets/liabilities/goals | Fixture hiện có + bản ghi self_reported đã kiểm tra kiểu, không trùng ID |
| payments | Khoản trả tối thiểu có ngày đến hạn trong 30 ngày; amount null vẫn giữ null |
| predictedBills, recurring | Dự đoán từ giao dịch định kỳ, không gọi là hóa đơn xác nhận |
| networth/health/runway/endOfMonth | Chỉ tiêu dùng chung với bộ tính của ứng dụng |
| opportunity | Buffer, giữ tiền cho nghĩa vụ/mục tiêu, phần dư ước tính và điều kiện đủ |
| dataQuality | Chế độ demo, profile đầy đủ/chưa đủ, số dòng/truncation, các feed còn thiếu |

Tổng hợp dùng toàn bộ dữ liệu hợp lệ. Chỉ gửi tối đa 500 giao dịch chi tiết mới nhất để giới hạn context; luôn khai báo truncation và tổng số dòng. Không gửi số tài khoản, tên người thụ hưởng, số điện thoại hoặc CIF trực tiếp vào prompt. Tên merchant và nhãn người dùng vẫn là dữ liệu tự do, được prompt coi là dữ liệu không đáng tin về mặt chỉ dẫn.

Topup session là overlay chỉ phục vụ phân tích, không ghi vào ledger. Khác với prototype cũ, widget không bị ẩn khi vừa nạp hũ. Overlay làm tăng số còn lại của hũ và giảm pool nhưng không làm tăng thu/chi.

## Chính sách chọn insight

| Ưu tiên | Điều kiện |
| --- | --- |
| 0 | Tổng khoản trả tối thiểu đã ghi nhận tới hạn trong 7 ngày |
| 1 | Hóa đơn định kỳ ước tính 7 ngày; hũ âm, dùng ≥80% hạn mức, hoặc có nguy cơ cạn |
| 2 | Chi hôm nay >1.5 lần baseline 29 ngày trước và chênh ≥200k; chi từ đầu tháng >1.3 lần cùng kỳ và chênh ≥500k |
| 3 | Trao đổi về sinh lời khi hồ sơ đủ, nợ không có dấu hiệu rủi ro theo dữ liệu có, không có insight 0–2, hũ có hạn mức/còn lại không âm, không có chi chưa gắn nhãn |
| 4 | Tiền chưa phân bổ ≥100k: hỏi muốn chia bao nhiêu/ưu tiên hũ nào |

Trong cùng priority, model được chọn candidate phù hợp nhất; prompt ưu tiên mức urgent. Fallback chọn theo priority, urgent rồi ID ổn định. Đây là các ngưỡng heuristic cấu hình trong code, chưa được hiệu chỉnh bằng dữ liệu hành vi/feedback thực tế.

Burn = 60% nhịp chi 7 ngày + 40% nhịp chi 30 ngày. Chỉ dự báo hũ có danh mục biến động, có ít nhất 3 ngày phát sinh chi; không suy rộng hũ chứa chi cố định. Refund được trừ, pending/reversed/transfer không tính thành chi bởi engine.

Phần dư để **trao đổi thêm** = pool trừ nghĩa vụ tối thiểu 30 ngày, hóa đơn dự kiến, toàn bộ phần mục tiêu còn thiếu và buffer `max(10 triệu, 3 × max(chi tháng này, chi tháng trước))`. Chỉ tạo candidate khi ≥5 triệu. Đây là phép sàng lọc bảo thủ, chưa phải đánh giá phù hợp đầu tư; không tự chọn sản phẩm/lợi nhuận. Profile thiếu, nợ thiếu thông tin, nợ có lãi suất ≥20% hoặc ngày đến hạn đã qua đều chặn candidate này.

## API

PFM browser → server:

```json
POST /api/proactive-insights/current
{
  "cif": "CIF_0001",
  "profile": { "assets": [], "liabilities": [], "goals": [], "complete": true },
  "topups": [{ "jarId": "existing-jar-id", "amount": 200000 }]
}
```

Response: `{ insight: { snapshotId, candidate, title, body, source: "agent"|"fallback", asOf } | null, cached, reason? }`. Không trả toàn bộ snapshot về browser. Không có candidate hoặc snapshot đã ẩn → insight null.

Sự kiện: POST cùng route `{ cif, snapshotId, event: "displayed"|"dismissed" }`; trả `{ recorded }`. Cache scope theo CIF + hash: 30 phút cho model, 60 giây cho fallback. Dismiss cùng snapshot 24 giờ; snapshot thay đổi có thể hiển thị lại. Request đồng thời cùng snapshot dùng chung một lần gọi model trong process.

PFM server → Python:

```json
POST /proactive-insights
X-API-Key: <server-side credential>
{ "snapshot_id": "<sha256>", "snapshot": { "schemaVersion": "2.0", "...": "financial domains" } }
```

Response `{ snapshot_id, candidate_id, title, body }`. Python kiểm tra key, unique candidate, snapshot ≤350k ký tự, model output có schema; 401 auth, 422 input, 502 output sai, 503 model lỗi/thiếu key. Model timeout 15s, proxy toàn luồng 20s, browser 30s. Prompt: `personal-pfm-agent/prompts/proactive_insight.md`, có 7 few-shot cho bốn nhóm nhu cầu và tình huống cạnh tranh ưu tiên.

## Chạy local / triển khai

Agent mới được include trong `personal-pfm-agent/server.py`; deploy repo đó thì `/proactive-insights` đi cùng `/chat` và `/insight` cũ. Docker hiện tại copy cả source và prompts. Endpoint không cần Memory nhưng ứng dụng server đầy đủ vẫn có các yêu cầu cấu hình Memory hiện hữu.

Có thể chạy riêng để kiểm tra mà không đổi backend chat:

```powershell
# Tại personal-pfm-agent. Cấu hình secret trực tiếp trong môi trường, không commit.
# SERVER_API_KEY phải khớp AGENT_API_KEY của PFM.
# AI_PLATFORM_API_KEY là khóa model, LLM_MODEL là tùy chọn.
.venv\Scripts\python.exe -m uvicorn proactive_endpoint:app --host 127.0.0.1 --port 8081

# Tại pfm. Chỉ đổi endpoint insight, các route chat/STT vẫn dùng cấu hình cũ.
$env:AGENT_PROACTIVE_API_URL='http://127.0.0.1:8081/proactive-insights'
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3000
```

Không override: dùng `AGENT_API_BASE_URL/proactive-insights` và auth hiện hữu. Override riêng dùng X-API-Key, không lấy token Auth0; phù hợp local hoặc endpoint nhận API key trực tiếp.

## Kiểm thử và giới hạn

Các test mới kiểm tra: lịch VN, refund/pending/transfer, cap 500 dòng giữ nguyên tổng, so sánh cùng kỳ, minimum payment vs unknown, session topup, điều kiện investment, cache/dismiss theo CIF, gọi đồng thời, fallback/model output sai, validation route, mở Sheet, chuyển câu hỏi đúng persona, không tự gửi chat. Bộ test Python kiểm tra auth, payload, full snapshot, stateless, priority và redaction lỗi. TypeScript và production build đã qua; build còn warning cũ trong TransactionListSection về dependency useMemo.

Chưa xác nhận chất lượng câu chữ từ model thật: môi trường local chưa cấu hình AI_PLATFORM_API_KEY. Endpoint local health đã chạy ở 8081. Việc khởi chạy PFM3000 trong phiên bị cơ chế duyệt tự động chặn; chưa xác minh bằng trình duyệt. Không coi test model mock là kiểm thử model thật.

Một test cũ `personal-pfm-agent/tests/test_agent.py` cần package `managed_deepagents` chưa có trong venv hiện tại; đây là đường managed deployment khác với FastAPI server đang kiểm thử. Các test server và endpoint liên quan vẫn chạy được.

Clock của app vẫn là demo 15/09/2026, không phải ngày máy. Feed hóa đơn xác nhận, số dư toàn bộ sao kê thẻ, trạng thái đã thanh toán và khẩu vị rủi ro chưa có; snapshot ghi rõ các thiếu hụt. Endpoint PFM theo cơ chế CIF demo hiện có, chưa phải phân quyền tenant production. Trước production cần CIF từ session xác thực, rate limit phân tán, data freshness thực, và đánh giá copy/precision/tỷ lệ mở/tỷ lệ ẩn trên dữ liệu được phép sử dụng.

## Khôi phục local database đã thực hiện

WAL từ trước hard reset không khớp file SQLite mới, gây `malformed database schema`. Database gốc kiểm tra `immutable` trả `ok`. Đã sao lưu database và di chuyển sidecar cũ vào `test-results/db-before-insight-recovery-20260923/`; không reseed hoặc xóa dữ liệu gốc. Test đọc SQLite sau khi tách WAL đã qua.

Các thay đổi chưa commit/push. Những file prototype chưa được track từ trước vẫn được giữ; schema thêm các bảng compatibility để route profile cũ không lỗi, Home mới chỉ sử dụng `home_insight_cache`.
