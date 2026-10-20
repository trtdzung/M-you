# Rule thao tác trên màn Mục tiêu (pfm)

Tài liệu mô tả các rule còn lại và hành vi hiện tại của thao tác trên mục tiêu trong `src/features/goals-preview`. Đọc từ code. Chưa chạy các test server có ghi sổ vì file sqlite đã commit đang hỏng (`database disk image is malformed`).

Nguyên tắc: khách dùng được mọi tính năng. Chỉ còn chặn khi dữ liệu không tồn tại, số tiền không hợp lệ hoặc không đủ tiền. Không còn rule chặn theo trạng thái mục tiêu hay chính sách (ví dụ 40% thu nhập khi vay).

## 1. Allowlist thao tác (server)

`POST /api/goals-v2/actions` với body `{ cif, requestId, action }`. Hàm kiểm tra là `parseGoalAction` trong `server/goal-service.ts`. Thao tác bị từ chối trả HTTP 422 `{ error, world, market }` và không ghi gì.

- **Bị chặn hẳn** ("Thao tác này không dùng được với dữ liệu thật."): `world/sync`, `hydrate`, `loadScenario`, `reset`, `nav/*`, `toast/*`, `dismissSuggestion` và mọi `type` lạ.
- **Được nhận:** `advanceTime`, `setRiskProfile`, `createGoal`, `deposit`, `withdraw`, `setStandingOrder`, `runStandingOrderNow`, `reserveLoan`, `cancelReservedLoan`, `addAsset` (tên cũ `addFixedAsset` vẫn được nhận), `revalueAsset`, `removeAsset`, `setAssetQuantity`, `invest`, `sellAsset`, `handleMaturity`, `takeLoan`, `repay`, `prepay`, `startRepayment`, `completeEarly`, `extend`, `reduceTarget`, `pauseGoal`, `resumeGoal`, `closeGoal`, `reorderPriorities`.
- **Kiểm kiểu từng trường** (sai thì trả "Dữ liệu thao tác không hợp lệ."; server dựng lại action sạch và bỏ trường thừa):

| Trường | Điều kiện |
|---|---|
| `amount`, `principal`, `targetAmount`, `newTargetAmount`, `quantity` | số hữu hạn, lớn hơn 0 |
| `initialDeposit`, `value`, `proceeds`, `ratePa` | số hữu hạn, không âm |
| `termMonths` | số nguyên dương |
| `dayOfMonth` | số nguyên 1 đến 31 |
| `countPercent` | 0 đến 100 |
| `fraction` (`sellAsset`) | lớn hơn 0 và không quá 1 |
| `days` (`advanceTime`) | số nguyên dương, tối đa 3660 |
| ngày | đúng dạng `YYYY-MM-DD` |
| `template` | `car`, `house`, `travel`, `education`, `emergency`, `wedding`, `retirement`, `other` |
| `flexibility` | `date_fixed` (cũ), `date_flexible`, `amount_flexible`; reducer luôn đổi thành `date_flexible` |
| `category` (tài sản tự khai) | `house`, `car`, `motorbike`, `other`, `gold`, `stock`, `external_fund`, `deposit`, `bond` |
| `source` | `msb`, `self_reported`, `estimated` |
| `profile` | `conservative`, `balanced`, `growth` |
| `choice` (`handleMaturity`) | `rollover`, `toCash` |
| `settlement` (`takeLoan`) | `now`, `next` |
| `purchase` (`takeLoan`) | `{ assetId }` hoặc `{ name, category, value }` |
| `input` (`createGoal`) | chỉ các khoá `name`, `template`, `targetAmount`, `targetDate`, `flexibility`, `priority`, `note`, `initialDeposit` (không âm), `standingOrder` (`{ amount, dayOfMonth }`), `assets` (tối đa 20 tài sản tự khai, cùng kiểu kiểm tra với `addAsset`) |

## 2. Rule trong reducer (`store/reducer.ts`)

Vi phạm thì `fail()` trả thông báo và không đổi state.

| Thao tác | Bị chặn khi |
|---|---|
| `createGoal` | Số nạp ban đầu (`initialDeposit`) vượt số dư tài khoản chính |
| `deposit` | Chưa có tài khoản; số tiền ≤ 0; vượt số dư tài khoản chính |
| `withdraw` | Chưa có tài khoản; số tiền ≤ 0; vượt số dư tài khoản mục tiêu |
| `invest` | Không tìm thấy mục tiêu/sản phẩm; vượt số dư tài khoản mục tiêu |
| `repay` | Không có khoản vay đang hoạt động; hết kỳ; tài khoản mục tiêu không đủ tiền trả kỳ |
| `prepay` | Không có khoản vay đang hoạt động; số tiền ≤ 0; vượt số dư tài khoản mục tiêu |
| `takeLoan` | Không tìm thấy mục tiêu/sản phẩm vay; mục tiêu đã có khoản vay đang hoạt động |
| `reduceTarget` | Số tiền mục tiêu mới ≤ 0 |
| `removeAsset` | Khoản đầu tư MSB chưa bán |
| `setAssetQuantity` / `revalueAsset` | Tài sản không đúng loại; số lượng ≤ 0 |
| `sellAsset` / `handleMaturity` | Không tìm thấy tài sản/khoản gửi |
| các thao tác còn lại | Không tìm thấy mục tiêu |

Đã bỏ: giới hạn 40% thu nhập khi vay; số tối thiểu của sản phẩm đầu tư; yêu cầu khoản gửi đến hạn mới xử lý; yêu cầu trả kỳ quá hạn trước khi trả trước; yêu cầu hết nợ mới đóng mục tiêu; mọi ràng buộc trạng thái của `startRepayment`, `completeEarly`, `reserveLoan`, `pauseGoal`, `resumeGoal`; yêu cầu ngày gia hạn phải sau hôm nay.

## 3. Tài sản

Có hai loại, chỉ khác nhau về nguồn và cách xử lý, không còn nhãn "linh hoạt/cố định" trên giao diện.

- `type: "msb"`: khoản đầu tư MSB (tiết kiệm, tiền gửi, quỹ, trái phiếu). Bán và tất toán được, tiền về tài khoản.
- `type: "declared"`: tài sản khách tự khai hoặc ở nơi khác (nhà, xe, vàng, cổ phiếu…). Không tất toán, chỉ ghi nhận bán hoặc gỡ khỏi mục tiêu.

Bản ghi cũ `"liquid"` / `"fixed"` được đổi khi đọc từ `gv2_assets` (`server/world-repo.ts`).

## 4. Vay và sang giai đoạn 2

- Mọi mục tiêu có tài khoản đều có đủ 4 ô Nạp, Rút, Đầu tư, Vay trên màn tổng quan. Ô Vay mở lịch trả nợ nếu đã có khoản vay đang hoạt động.
- Bấm Vay khi tích luỹ dưới 30% giá trị mục tiêu thì hiện bottom sheet cảnh báo với nút Quay lại và Tiếp tục; `LoanApply` cũng hiện cảnh báo. Chỉ cảnh báo, không chặn.
- `takeLoan` (sang giai đoạn 2):
  - Tiền mặt trong tài khoản mục tiêu rút để mua tài sản (`purchase`: tài sản tự khai đang có, hoặc tài sản mới; mặc định là tài sản mục tiêu). Tiền không về tài khoản chính. Tài sản được mua giữ lại với `countPercent = 0`.
  - Các tài sản khác của mục tiêu biến mất.
  - Tiền vay không đi qua tài khoản mục tiêu.
  - Khoản đầu tư MSB: `settlement = "now"` rút toàn bộ giá trị hiện tại về tài khoản chính ngay; `"next"` hẹn `settleOn` (đáo hạn với tiền gửi có kỳ hạn, ngày 1 tháng sau với các khoản còn lại), đến ngày đó tự rút về tài khoản chính. Không trừ phí.
- Mục tiêu giai đoạn 2 = tổng gốc và lãi (`goalStage`); tiến độ = đã trả (gồm lãi) + tiền mặt + tài sản.
- `RepayOverview` có nút "Trả kỳ tháng này" khi đủ tiền; hệ thống vẫn tự trừ kỳ đến hạn khi tua thời gian.

## 5. Category giao dịch mục tiêu

Category hệ thống (ngoài `CATEGORIES`, không phải hũ, không tính là chi tiêu): `muc-tieu-nap`, `muc-tieu-rut`, `muc-tieu-mua-tai-san`, `muc-tieu-dau-tu`, `muc-tieu-lai`, `muc-tieu-tra-no`. Định nghĩa trong `domain/models/categories.ts`.

## 6. UI

- `canTransact(goal)` chỉ yêu cầu mục tiêu có tài khoản. Nạp, rút, trích tự động vẫn bị vô hiệu hoá khi tài khoản đã đóng.
- Đầu tư: số tiền lớn hơn 0 và không vượt tiền nhàn rỗi.
- Tạo mục tiêu: không còn lựa chọn cố định/linh hoạt; mọi mục tiêu là `date_flexible`, mục tiêu cũ được đổi khi đọc.

## 7. Tạo mục tiêu (không còn bản nháp)

- Không còn trạng thái `draft`, và không còn các action `updateDraftGoal`, `discardDraftGoal`, `openAccount` (server từ chối như action lạ).
- Quy trình trên giao diện (chọn loại, thông tin, xác nhận mở tài khoản) giữ kế hoạch trong tham số màn hình; chưa tạo gì cho đến khi khách xác nhận.
- `createGoal` là một bước duy nhất: tạo mục tiêu ở trạng thái `accumulating`, mở tài khoản mục tiêu, nạp ban đầu từ tài khoản chính (nếu có) và bật trích tự động (nếu có).
- Mục tiêu nháp cũ trong database bị bỏ khi đọc (`server/world-repo.ts`) và biến mất ở lần ghi tiếp theo.
- Đã xoá các màn `OpeningFunds`, `FeasibilityResult`, `OptionsCompare` vì chỉ phục vụ bản nháp.
- Bước thông tin có mục "Tài sản có sẵn" (dưới "Bạn cần bao nhiêu?"): khách thêm tài sản tự khai bằng màn `AddAsset` (chế độ tạo, tham số `wizard`); danh sách được giữ ở tham số màn hình (`assets`, JSON) rồi gửi trong `createGoal.input.assets`. Phần tài sản được tính vào mục tiêu giảm số tiền cần góp mỗi tháng.
