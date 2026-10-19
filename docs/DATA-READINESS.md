# MSB Financial Copilot (PFM) — Data Readiness & Architecture Context

> **Tài liệu ngữ cảnh kỹ thuật dành cho AI Agent & Nhà phát triển**
> Cung cấp bức tranh toàn diện về hệ thống dữ liệu, nguồn dữ liệu (Data Sources), tính sẵn sàng (Data Readiness), các ràng buộc bất biến (Invariants) và cách thức truy xuất / xử lý số liệu tài chính trong codebase PFM.

---

## 1. Nguyên tắc cốt lõi & Ràng buộc bất biến (Architectural Invariants)

Bất kỳ tính năng hoặc tác nhân AI (Agent) nào tương tác với hệ thống PFM này đều **bắt buộc tuân thủ 7 nguyên tắc bất biến**:

1. **Deterministic Engine là nguồn chân lý duy nhất (Source of Truth)**:
   - Toàn bộ số liệu tài chính (tổng thu/chi, số dư hũ, giá trị tài sản ròng, phân tích sức khỏe, quỹ chưa phân bổ) đều do **công cụ tính toán tất định** (`src/domain/engine/*`) sinh ra từ các giao dịch và dữ liệu thực tế.
   - **Tuyệt đối cấm LLM tự tính toán hoặc bịa đặt (hallucinate) số liệu tài chính**. LLM chỉ diễn giải, giải thích ngữ cảnh hoặc đề xuất kịch bản mô phỏng.

2. **AI là Facade bị giới hạn (Constrained Facade)**:
   - Agent chỉ có quyền gọi các **Read Tools** (đọc phân tích, đọc số dư) hoặc **Draft Tools** (soạn bản nháp chuyển khoản, đề xuất cơ cấu hũ).
   - Agent **không bao giờ có quyền ghi đè sổ cái** (ledger) hay tự động kích hoạt giao dịch tiền mặt.

3. **Không di chuyển tiền tự động (No Autonomous Money Movement)**:
   - Mọi hành động chuyển tiền phải do con người phê duyệt, xác nhận qua luồng native MSB và xác thực OTP/mật khẩu.
   - Tài khoản thụ hưởng chỉ được lấy từ danh bạ đã lưu (`beneficiaries`), lịch sử giao dịch thật (`counterpartyAccountNumber`) hoặc do người dùng nhập tay — tuyệt đối không sinh số tài khoản giả lập.

4. **UI và Domain phụ thuộc vào Provider Interfaces, không phụ thuộc Fixture**:
   - Giao diện và logic nghiệp vụ tương tác qua abstraction layers (`Providers` interface tại `src/providers/interfaces.ts`), không import trực tiếp các file mock fixture.

5. **Mọi số liệu đều mang nhãn nguồn gốc (Provenance)**:
   - Các bản ghi và số liệu tổng hợp luôn mang nhãn `source`:
     - `msb`: Dữ liệu chính thức từ core banking ngân hàng MSB.
     - `self_reported`: Dữ liệu người dùng tự nhập (thủ công qua FAB, chuyển khoản, điều chỉnh hũ).
     - `estimated`: Số liệu ước lượng/dự phóng từ thuật toán (hóa đơn dự kiến, runway tiền mặt).
     - `mock`: Dữ liệu kịch bản giả lập phục vụ phát triển/demo.

6. **Dữ liệu thiếu phải giữ nguyên trạng thái chưa xác định (`null` / `unknown`)**:
   - Tuyệt đối không tự động gán giá trị mặc định bằng `0` khi chưa có dữ liệu. Ví dụ: hạn mức hũ chưa đặt (`budget_limit: null`), tài sản chưa định giá (`value: null`).
   - Loại trừ giao dịch chuyển khoản nội bộ khỏi dòng tiền thu/chi; hoàn tiền (`refund`) ghi giảm đúng danh mục chi tiêu; giao dịch hủy (`reversed`) bị loại bỏ hoàn toàn; giao dịch đang chờ (`pending`) tách biệt khỏi số liệu đã quyết toán (`posted`).

7. **Danh mục chi tiêu là Dữ liệu (Categories are Data)**:
   - Hệ thống danh mục phân loại chi tiêu tiếng Việt là dữ liệu động lưu trong DB theo từng khách hàng (`cif`), không bị hardcode cứng trong mã nguồn giao diện.

---

## 2. Bản đồ luồng dữ liệu tổng thể (Data Architecture Flow)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CÁC NGUỒN DỮ LIỆU ĐẦU VÀO                       │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ 1. SQLite Database│ 2. Client Storage │ 3. External & AI Services      │
│ (data/pfm.sqlite3)│ (localStorage/    │ • M-You Agent (port 8080)      │
│ • accounts        │  sessionStorage)  │ • Streaming STT (port 8000)    │
│ • transactions    │ • user assets     │ • Hosted LLM (VNG GreenNode /  │
│ • categories      │ • user liabilities│   Anthropic / OpenAI)          │
│ • jars            │ • user goals      │ • Deterministic Seed Fixtures  │
│ • jar_ledger      │ • category memory │   (Mulberry32 PRNG Generator)  │
│ • beneficiaries   │ • consent scope   │                                │
│ • agent_pref, etc.│ • transfer draft  │                                │
└─────────┬─────────┴─────────┬─────────┴────────────────┬───────────────┘
          │                   │                          │
          ▼                   ▼                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS BFF ROUTE HANDLERS (/api/*)                   │
│   /api/accounts, /api/transactions, /api/jars, /api/agent/chat, ...    │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                PROVIDER ABSTRACTION (src/providers/*)                  │
│       Interfaces: Account, Transaction, Asset, Liability, Goal,        │
│       Market, Beneficiary, AgentPreferences, Jars, Categories          │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│               DETERMINISTIC FINANCIAL ENGINE (src/domain/engine/*)     │
│   • computeFinancials (finance-compose.ts)    • jarBalances            │
│   • aggregateCashflow                         • computeUnallocatedPool │
│   • calculateNetWorth                         • evaluateFunding        │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      UI PRESENTATION & STATE HOOKS                     │
│        useFinancials, useJarConfig, useCategories, MYourWidget         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Danh mục các nguồn dữ liệu chi tiết

### 3.1. Cơ sở dữ liệu SQLite Server-side (`data/pfm.sqlite3`)
- **Vị trí**: `data/pfm.sqlite3`
- **Cơ chế truy cập**: `better-sqlite3` ở chế độ WAL (`journal_mode = WAL`), chỉ chạy ở môi trường server (`server-only` tại `src/lib/db.ts`).
- **DDL Schema**: `data/schema.sql` (chi tiết xem `data/schema.md`).

| Tên bảng | Khóa chính (PK) | Mục đích dữ liệu & Ý nghĩa nghiệp vụ | API quản lý |
| :--- | :--- | :--- | :--- |
| **`accounts`** | `(cif, id)` | Nguồn chân lý cho tài khoản ngân hàng (CASA, Tiết kiệm, Thẻ tín dụng). Trường `balance` và `available_balance` sẽ bị trừ thật trên server khi hoàn tất chuyển khoản (`/api/accounts/debit`). | `GET /api/accounts`<br>`POST /api/accounts/debit` |
| **`transactions`** | `(cif, id)` | Lưu trữ **toàn bộ giao dịch** của persona: gồm lịch sử ngân hàng (`source = 'mock'/'msb'`) và giao dịch tự khai báo (`source = 'self_reported'`). Dữ liệu chi tiết nằm trong cột JSON `payload`. Có cờ `source` và `posted_at` được đánh index. | `GET /api/transactions`<br>`GET /api/transactions-full`<br>`POST/PATCH /api/manual-transactions` |
| **`jars`** | `(cif, id)` | Cấu hình các Hũ chi tiêu: nhãn `label`, danh sách mã danh mục thuộc hũ `category_ids` (JSON array), hạn mức kế hoạch tháng `budget_limit` (NULL nếu chưa đặt), thời điểm tạo `created_at` (anchor tính số dư). | `GET /api/jars`<br>`POST /api/jars`<br>`PATCH /api/jars/:id`<br>`DELETE /api/jars/:id` |
| **`jar_ledger`** | `(cif, id)` | Sổ cái ghi nhận các lượt nạp/rút trực tiếp vào hũ (`deposit`/`withdraw`). Đây là display partition của tài khoản CASA, không phải chuyển tiền thực. Dùng để tính toán số dư lũy kế (`balance`). | `POST /api/jar-ledger`<br>`GET /api/jar-summary` |
| **`categories`** | `(cif, id)` | Hệ thống phân loại danh mục chi tiêu/chuyển tiền **theo từng CIF khách hàng**. Cho phép người dùng tùy biến danh mục cá nhân mà không gây ảnh hưởng đến persona khác. | `GET /api/categories`<br>`POST /api/categories`<br>`PATCH /api/categories/:id`<br>`DELETE /api/categories/:id` |
| **`transaction_corrections`** | `(cif, txn_id)` | Lớp ghi đè danh mục (Overlay): Lưu các điều chỉnh danh mục của người dùng, cờ ẩn giao dịch `hidden`, kết quả AI gán nhãn tự động (`origin`, `confidence`, `status`). Không làm thay đổi giao dịch gốc. | `GET /api/corrections`<br>`PATCH /api/corrections` |
| **`beneficiaries`** | `id` (UNIQUE: `cif, bank_name, account_number`) | Danh bạ người thụ hưởng đã lưu cho luồng chuyển tiền (tên, STK, ngân hàng, provenance `source`). | `GET /api/beneficiaries`<br>`POST /api/beneficiaries` |
| **`agent_preferences`** | `cif` | Tùy chọn phong cách tương tác cho trợ lý M-You: `response_length`, `tone`, `risk_appetite`, `address_as`, `about`, `notes`. | `GET /api/agent-preferences`<br>`PUT /api/agent-preferences` |
| **`proactive_insights`** | `(cif, insight_id, version)` | Lưu lịch sử các insight chủ động đã tạo, tránh bắn thông báo trùng lặp. | `POST /api/proactive-insights/current` |
| **`proactive_insight_events`** | `(cif, insight_id, version, event_type)` | Lưu sự kiện tương tác của người dùng (`displayed`, `dismissed`). | `POST /api/proactive-insights/current` |
| **`proactive_financial_profiles`** | `cif` | Hồ sơ tài chính đã xác thực (tài sản, nợ, mục tiêu) đồng bộ tạm thời từ browser lên server. | `POST /api/proactive-insights/profile` |

---

### 3.2. Bộ sinh dữ liệu mẫu tất định (Deterministic Generator & Personas)
Dữ liệu mẫu được sinh ra bằng thuật toán giả ngẫu nhiên có hạt giống (PRNG `mulberry32`), đảm bảo mọi lần chạy với cùng một Persona đều ra kết quả giống hệt nhau (`src/providers/mock/`):

1. **Danh sách Persona mẫu (`src/providers/mock/personas.ts`)**:
   - `CIF_0001` - **Ly Lã (`stable`)**: Lương cố định 30.000.000 ₫, chi tiêu đều đặn, tài sản gồm tiền gửi 6 tháng, chứng chỉ quỹ, vàng SJC, nợ vay tiêu dùng nhỏ. Hạng hội viên: `M-FIRST GOLD`.
   - `CIF_0002` - **Toàn Trần (`irregular`)**: Thu nhập biến động 35.000.000 ₫ (độ lệch 55%), chi tiêu ngẫu hứng, có nợ thẻ tín dụng và trả góp điện thoại. Hạng: `M-FIRST`.
   - `CIF_0003` - **Đào Nguyên (`wealthy`)**: Thu nhập cao 100.000.000 ₫, danh mục tài sản lớn (tiền gửi lớn, quỹ, cổ phiếu, vàng miếng, căn hộ chưa định giá), nợ thế chấp mua nhà 1.8 tỷ ₫. Hạng: `M-FIRST PRIVATE`.

2. **Dữ liệu giao dịch 6 tháng (`src/providers/mock/fixtures/generate.ts`)**:
   - Tạo ~6 tháng lịch sử giao dịch tính từ ngày neo `2026-09-15`: Lương về (`income`), chi phí cố định (nhà ở, điện nước, internet, gym, Netflix), chi tiêu sinh hoạt biến đổi (Grab, WinMart, Shopee, Highlands...), chuyển khoản nội bộ sang sổ tiết kiệm, hoàn tiền hoàn phí, giao dịch bị đảo ngược (`reversed`), và giao dịch đang xử lý (`pending`).
   - Cố tình để lại tỷ lệ **18% giao dịch chưa phân loại (`UNCLASSIFIED`)** trong danh mục chi tiêu tự do để thử nghiệm pipeline AI auto-categorization.

3. **Cấu hình Hũ mẫu (`data/seed-jars.json`)**:
   - 6 hũ mặc định: *Ăn uống*, *Thiết yếu*, *Mua sắm*, *Di chuyển*, *Giải trí*, *Tiết kiệm*.

---

### 3.3. Bộ lưu trữ phía Trình duyệt (Browser LocalStorage & SessionStorage)
Phục vụ lưu trữ các dữ liệu do người dùng tự nhập trực tiếp trên máy khách (`src/lib/persona-storage.ts`):

- **Tài sản tự khai báo**: `msb-pfm.assets.<personaId>` (`UserRecordStore<Asset>`)
- **Khoản nợ tự khai báo**: `msb-pfm.liabilities.<personaId>` (`UserRecordStore<Liability>`)
- **Mục tiêu tài chính**: `msb-pfm.goals.<personaId>` (`UserRecordStore<GoalRecord>`)
- **Trí nhớ danh mục người dùng**: `msb-pfm.category-memory.<cif>` (bản đồ nhớ `merchant -> categoryId` do người dùng từng xác nhận, được ưu tiên gọi trước khi nhờ AI phân loại).
- **Quyền AI & Onboarding**: `msb-pfm.consent` (lưu phạm vi cấp quyền `"ai"`), `msb-pfm.onboarding` (trạng thái hoàn thành giới thiệu ban đầu).
- **Session Transfer Draft**: `sessionStorage` (chuyển tiếp an toàn bản nháp chuyển tiền từ chat sang màn hình xác thực native MSB).

---

### 3.4. Dịch vụ AI & Hệ thống bên ngoài (External Services)

1. **M-You Agent Backend (Trợ lý tài chính thông minh)**:
   - **URL**: `http://127.0.0.1:8080` (cấu hình `AGENT_API_BASE_URL`).
   - **Authentication**: `AGENT_API_KEY` (được bảo vệ thông qua backend proxy `POST /api/agent/chat`).
   - **Giao thức**: Nhận `message` + `user_id` (`cif`), trả về văn bản tư vấn và các UI payload có cấu trúc:
     - `chart`: Vẽ biểu đồ chi tiêu (bar/line/pie).
     - `transfer_form`: Đề xuất lệnh chuyển tiền từ danh bạ thụ hưởng đã lưu.
     - `create_jar` / `edit_jar`: Đề xuất tạo hoặc cập nhật hũ chi tiêu.
     - `rebalance_jars` / `distribute_amount`: Đề xuất điều chuyển số dư giữa các hũ hoặc từ quỹ chưa phân bổ.
     - `clarify_options`: Đưa ra danh sách câu hỏi làm rõ nhu cầu tài chính.

2. **Dịch vụ Streaming Speech-to-Text (STT) Tiếng Việt**:
   - **URL**: `http://127.0.0.1:8000` (cấu hình `STT_API_BASE_URL`).
   - **Giao thức**: Gọi HTTP `POST /api/stt/session` để lấy WebSocket ticket kèm danh sách keyterms/aliases tài chính, sau đó client mở WebSocket stream âm thanh PCM 16kHz để nhận diện giọng nói tiếng Việt tức thời.

3. **Mô hình ngôn ngữ (LLM Providers)**:
   - Cấu hình qua biến môi trường `LLM_PROVIDER`:
     - `vng`: VNG GreenNode AI Cloud MaaS (`https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1`, chạy model Qwen/GLM).
     - `anthropic`: Anthropic Claude.
     - `openai`: OpenAI (GPT-4o, GPT-4o-mini).
     - `none`: Chế độ offline (tự động chuyển sang bộ từ điển đối soát từ khóa nội bộ `localClassify` khi không có kết nối LLM).

---

## 4. Cách thức dữ liệu được tổng hợp (Data Aggregation & Engine Pipeline)

Mọi màn hình giao diện trong PFM đều lấy dữ liệu thông qua hook chuẩn hóa duy nhất: **`useFinancials()`** (`src/state/useFinancials.ts`):

```text
useFinancials() Hook
  │
  ├── 1. Tải raw data từ Providers (Promise.all):
  │      • providers.listTransactions()    -> Từ SQLite `transactions`
  │      • providers.listAccounts()        -> Từ SQLite `accounts`
  │      • providers.listAssets()          -> Seed fixtures
  │      • providers.listLiabilities()     -> Seed fixtures
  │      • providers.getBudgets()          -> Seed fixtures
  │      • providers.getMonthlySnapshots() -> Lịch sử Net Worth 6 tháng
  │      • providers.listGoals()           -> Seed fixtures
  │      • providers.listMockProducts()    -> Danh mục sản phẩm MSB
  │
  ├── 2. Kết hợp với trạng thái người dùng (Context):
  │      • manualTxns      -> Giao dịch nhập tay & điều chỉnh hũ (SQLite)
  │      • corrections     -> Danh mục đã sửa, cờ ẩn giao dịch (SQLite)
  │      • userAssets      -> Tài sản người dùng thêm mới (LocalStorage)
  │      • userLiabilities -> Nợ người dùng thêm mới (LocalStorage)
  │      • userGoals       -> Mục tiêu người dùng thêm mới (LocalStorage)
  │      • jarConfig       -> Cấu hình & Sổ cái nạp/rút hũ (SQLite)
  │      • categories      -> Hệ thống danh mục của CIF (SQLite)
  │
  └── 3. Đưa vào Deterministic Financial Engine (`computeFinancials`):
         • Dòng tiền thu/chi, tỷ lệ chi tiêu cố định vs linh hoạt
         • Số dư thực tế từng hũ: Balance = Σ(nạp) - Σ(rút) - Σ(đã chi) + Σ(điều chuyển)
         • Hạn mức & Tình trạng cảnh báo hũ (ok / near >=80% / over)
         • Quỹ chưa phân bổ (Unallocated Pool = Tổng CASA khả dụng - Tổng số dư hũ khả dụng)
         • Giá trị tài sản ròng (Net Worth = Tổng tài sản - Tổng nợ)
         • Chỉ số sức khỏe tài chính: Số tháng runway tiền mặt, tỷ lệ tập trung tài sản
```

---

## 5. Hướng dẫn dành cho AI Agent khi khai thác dữ liệu (Data Readiness Checklist)

Khi một AI Agent tương tác với hệ thống PFM, cần nắm vững các điểm kiểm tra sau:

| Tác vụ của Agent | Nguồn dữ liệu cần đọc | Điểm cần lưu ý (Checklist) |
| :--- | :--- | :--- |
| **Hỏi số dư tiền khả dụng để chi tiêu/chuyển khoản** | `GET /api/account-summary?cif=` | Đọc trường `casaBalance`. Nếu là `null`, trả lời chưa xác định, không tự bịa số 0. |
| **Hỏi tình hình các Hũ chi tiêu** | `GET /api/jar-summary?cif=&month=YYYY-MM` | Phân biệt rõ 2 trục số liệu độc lập: **Hạn mức tháng (`limit`)** là kế hoạch; **Số dư hũ (`balance`)** là lượng tiền thực tế có trong hũ. Đọc `allocationHeadroom` để biết quỹ chưa phân bổ còn bao nhiêu. |
| **Đọc lịch sử giao dịch** | `GET /api/transactions-full?cif=&from=&to=` | Giao dịch đã được resolve qua lớp corrections (danh mục chuẩn). Kiểm tra cờ `hidden: true` (giao dịch bị người dùng ẩn khỏi báo cáo). |
| **Đề xuất chuyển tiền (`transfer_form`)** | `GET /api/beneficiaries?cif=` | Chỉ đề xuất người thụ hưởng có trong danh sách hoặc từ lịch sử thật. Không tự tạo STK mới. |
| **Đề xuất điều chỉnh số dư hũ (`rebalance_jars` / `distribute_amount`)** | `GET /api/jar-summary?cif=` | Số tiền điều chuyển phải `<= spendable` của hũ nguồn (hoặc `<= allocationHeadroom` nếu lấy từ quỹ chưa phân bổ). Số tiền phải là số nguyên dương VND. |
| **Đề xuất tạo hũ mới (`create_jar`)** | `GET /api/jar-summary?cif=`<br>`GET /api/categories?cif=` | Bắt buộc phải có cả `allocation_amount` (hạn mức tháng) và `initial_balance` (số dư ban đầu lấy từ quỹ chưa phân bổ). Danh mục gán vào hũ phải thuộc danh mục hợp lệ của CIF đó. |

---

## 6. Sẵn sàng dữ liệu cho Financial Health Index (Bảng 2) & Proactive Insights (Bảng 3)

### 6.1. Financial Health Index (`src/domain/engine/health-score.ts`, Policy: `pfm-health-v0`)
Bộ chỉ số đánh giá sức khỏe tài chính khách hàng gồm 4 trụ cột và 8 chỉ số (trọng số cơ bản 12.5%/chỉ số, 25%/trụ cột). Dữ liệu thiếu được giữ nguyên `null` với lý do rõ ràng:

| Trụ cột (Pillar) | Mã chỉ số | Trạng thái sẵn sàng | Nguồn dữ liệu & Điều kiện kích hoạt |
| :--- | :--- | :--- | :--- |
| **SPEND** | `SPENDING_TO_INCOME` | **READY** | Tính trên cửa sổ thu/chi đa tháng (yêu cầu ít nhất 2 tháng có thu nhập > 0). Tỷ lệ <= 0.7 đạt 100 điểm, > 1.3 đạt 0 điểm. |
| **SPEND** | `PAYMENT_TIMELINESS` | **BLOCKED_DATA** (`null`) | Giữ `null` vì chưa có cơ chế đối soát liên kết thời điểm thanh toán thực tế với nghĩa vụ đến hạn. Không suy diễn từ việc không bị phạt. |
| **SAVE** | `CASH_RUNWAY` | **READY** | Tái sử dụng `cashRunwayMonths()` từ số dư khả dụng tài khoản vãng lai (`current`) và tiết kiệm (`savings`) chia cho chi tiêu tháng. >= 6 tháng đạt 100 điểm. |
| **SAVE** | `SAVINGS_RATE` | **READY** | Tỷ lệ tích lũy ròng (thu - chi) trên thu nhập đa tháng. Tỷ lệ >= 20% đạt 100 điểm. |
| **BORROW** | `DEBT_SERVICE_RATIO` | **READY** | Nghĩa vụ trả nợ tối thiểu tháng / thu nhập trung bình. Nếu không có nợ, chỉ ghi nhận điểm 100 khi hồ sơ nợ được xác nhận hoàn tất (`liabilitiesConfirmedComplete = true`); ngược lại trả về `null`. |
| **BORROW** | `CREDIT_BEHAVIOR` | **BLOCKED_DATA** (`null`) | Giữ `null` vì chưa tích hợp cổng thông tin tín dụng CIC hoặc nguồn điểm tín dụng được cấp phép. |
| **PLAN_PROTECT** | `GOAL_PROGRESS` | **READY** | Tỷ lệ tích lũy trung bình của các mục tiêu tài chính có hạn mức (`targetAmount > 0`). Nếu chưa lập mục tiêu trả về `null` (không phạt điểm 0). |
| **PLAN_PROTECT** | `INSURANCE_COVERAGE` | **READY** | Dựa trên hợp đồng/khai báo bảo hiểm đã xác thực (`true` -> 100, `false` -> 0, chưa rõ -> `null`). Không tự suy diễn từ giao dịch phí. |

*Ngưỡng hiển thị điểm tổng thể*: Điểm tổng thể (`overallScore`) chỉ hiển thị khi có **ít nhất 3/4 trụ cột** và **ít nhất 5/8 chỉ số** có thể tính toán; ngược lại giữ `null` kèm lý do dữ liệu chưa đầy đủ.

### 6.2. Proactive Insights Catalog (`src/insights/proactive/snapshot.ts`)

| Mã quy tắc (Rule ID) | Trạng thái | Mức ưu tiên | Mô tả nghiệp vụ & Ràng buộc an toàn |
| :--- | :--- | :--- | :--- |
| `known_payment_due_reminder` | **ACTIVE** | P0 (urgent/attention) | Nhắc khoản thanh toán tối thiểu sắp đến hạn trong 0-30 ngày (khẩn cấp trong 7 ngày). Tuyệt đối không coi số tiền tối thiểu là dư nợ sao kê toàn bộ. |
| `jar_plan_pressure` | **ACTIVE** | P1 (urgent/attention) | Cảnh báo hũ chi tiêu: phân biệt rõ `needs_cover` (số dư < 0, urgent), `over_limit_covered` (vượt hạn mức tháng nhưng số dư >= 0, attention), `near_limit` (chi >= 80% hạn mức, attention), `burn_risk` (nguy cơ cạn sớm). Hũ chưa đặt hạn mức không cảnh báo hạn mức. |
| `spending_spike` | **ACTIVE** | P2 (attention) | Chi tiêu danh mục tăng > 1.3x và tăng tuyệt đối >= 500.000 ₫ so với cùng kỳ tháng trước (so khớp đúng số ngày đã trôi qua). |
| `refund_received` | **ACTIVE** | P3 (info) | Ghi nhận giao dịch hoàn tiền (`refund`) đã quyết toán trong vòng 3 ngày gần nhất. Cấn trừ đúng danh mục, không tính vào thu nhập mới. |
| `deposit_maturity` | **BLOCKED_DATA** | P1 | Bị chặn do model `Account`/`Asset` hiện tại chưa có trường ngày đáo hạn sổ tiết kiệm. |
| `cash_liquidity_risk` | **BLOCKED_DATA** | P0 | Bị chặn do dự báo dòng tiền chưa đủ dữ liệu nghĩa vụ tương lai để khẳng định thiếu hụt tiền mặt. |
| `idle_cash_90d` | **BLOCKED_DATA** | P4 | Bị chặn do chưa có chuỗi số dư lịch sử 90 ngày của tài khoản CASA. |

### 6.3. Kiến trúc luồng xử lý (Single Dispatcher Pipeline)
Hệ thống sử dụng **duy nhất** luồng xử lý:
`HomeInsightWidget` -> `POST /api/proactive-insights/current` -> `home-insight-service.ts` -> `customerSnapshot()` -> `buildCustomerSnapshot()`.
Bảng cache `home_insight_cache` đảm bảo tính ổn định trong phiên và áp dụng chính sách ẩn 24 giờ sau khi người dùng đóng gợi ý. Pipeline chưa sử dụng trong `proactive-insights-service.ts` tiếp tục được lưu ý để di trú hợp nhất trong giai đoạn sau.

