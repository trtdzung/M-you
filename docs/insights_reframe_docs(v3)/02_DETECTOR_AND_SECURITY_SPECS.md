# 02. DETECTOR RULES, AI AGENT FRAUD MATRIX & 5-SLIDE ORCHESTRATION

## 1. Đầu vào Bảo mật mở rộng (`SecuritySummaryInput` trong `snapshot.ts`)

Trong `src/insights/proactive/snapshot.ts` và `src/lib/financial-snapshot-service.ts`, mở rộng `securitySummary`:

```ts
export interface SecuritySummaryInput {
  score?: number;
  hasEmergencyContact?: boolean;
  hasActiveHold?: boolean;
  hasMaturingFd?: boolean;
  hasActiveCase?: boolean; // SC3: có hồ sơ tra soát đang mở trong src/lib/security/case-store.ts
  largeUnknownInflow?: { amount: number; senderName?: string }; // BT5 (T7b): nhận >= 10 triệu từ TK lạ
  baitInflow?: { count: number; lastAmount: number; senderName?: string }; // BT4 (T7a): nhận >= 3 khoản nhỏ liên tiếp từ 1 TK lạ
  highBalanceInflow?: { amount: number }; // BT3: nhận khoản >= 50 triệu
  isNewUserOnboarding?: boolean; // BT1
}
```

Trong `src/lib/financial-snapshot-service.ts`:
- Đọc `listCases(personaId)` từ `src/lib/security/case-store.ts`: nếu có hồ sơ chưa đóng -> `hasActiveCase = true`.
- Quét `transactions` để tự động điền `largeUnknownInflow` (giao dịch nhận `>= 10_000_000` không phải lương), `baitInflow` (`>= 3` giao dịch nhận `< 500_000` từ cùng 1 nguồn trong 2 ngày), và `highBalanceInflow` (giao dịch nhận `>= 50_000_000`).

---

## 2. Ma trận Detectors Bảo mật (`domain: 'SECURITY'`)

### A. Mức ĐỎ (`securityLevel: 'RED'`, `category: 'SECURITY_RED'`, `tone: 'urgent'`) — Đứng đầu Carousel
1. **Kịch bản `SC3 / Hold` (`id: 'security:sc3_active_case'`):**
   - **Trigger:** `securitySummary?.hasActiveCase === true` hoặc `securitySummary?.hasActiveHold === true`.
   - **Title:** `"Hồ sơ của bạn đang được xử lý."`
   - **ImpactLine:** `"Lưu ý: bất kỳ ai đề nghị 'hỗ trợ lấy lại tiền' có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app này."`
   - **BadgeText:** `"Bảo mật · Đỏ"`
   - **Chips:** `[{ label: 'Xem trạng thái hồ sơ', actionType: 'view_fraud_case', href: '/settings', variant: 'primary' }]`

2. **Kịch bản `BT5` - Tín hiệu `T7b` (`id: 'security:bt5_large_unknown_inflow'`):**
   - **Trigger:** Có `securitySummary?.largeUnknownInflow` (`amount >= 10_000_000`).
   - **Title:** `"Bạn vừa nhận {formatVndCompact(amount)} từ tài khoản lạ."`
   - **ImpactLine:** `"Nếu có người báo chuyển nhầm và nhờ chuyển trả vào tài khoản khác, đừng làm. MSB sẽ tra soát và hoàn trả về đúng tài khoản gốc."`
   - **BadgeText:** `"Cảnh báo Đỏ"`
   - **Chips:**
     - `{ label: 'Yêu cầu MSB tra soát', actionType: 'request_msb_investigation', prompt: 'Tôi vừa nhận khoản tiền lạ và muốn yêu cầu MSB tra soát hoàn trả về tài khoản gốc.', variant: 'primary' }`
     - `{ label: 'Tôi biết khoản này', actionType: 'mark_known_sender', variant: 'secondary' }`

### B. Mức VÀNG (`securityLevel: 'AMBER'`, `category: 'SECURITY_AMBER'`, `tone: 'warning'`) — Đứng ngay sau Đỏ, trước PFM
3. **Kịch bản `BT4` - Tín hiệu `T7a` (`id: 'security:bt4_bait_inflow'`):**
   - **Trigger:** Có `securitySummary?.baitInflow` (`count >= 3`).
   - **Title:** `"Bạn vừa nhận {formatVndCompact(lastAmount)} từ tài khoản lạ."`
   - **ImpactLine:** `"Nếu đây là 'hoa hồng làm nhiệm vụ', đó thường là bước mồi của lừa đảo."`
   - **BadgeText:** `"Cảnh báo Vàng"`
   - **Chips:**
     - `{ label: 'Xem thủ đoạn', actionType: 'open_security_handbook', variant: 'primary' }`
     - `{ label: 'Tôi biết người này', actionType: 'mark_known_sender', variant: 'secondary' }`

### C. Mức XANH (`securityLevel: 'GREEN'`, `category: 'SECURITY_GREEN'`, `tone: 'security'`) — Đứng cuối Carousel (sau PFM)
4. **Kịch bản `BT3` - Số dư tăng mạnh chưa có người thân (`id: 'security:bt3_high_balance'`):**
   - **Trigger:** `!securitySummary?.hasEmergencyContact` VÀ (`securitySummary?.highBalanceInflow` hoặc `totalLiquidVnd >= 50_000_000`).
   - **Title:** `"Khoản {formatVndCompact(amount)} vừa về. Thêm người thân khẩn cấp để bảo vệ tài khoản."`
   - **ImpactLine:** `"Luôn có người cùng bạn kiểm tra khi có giao dịch bất thường."`
   - **BadgeText:** `"Bảo mật · Xanh"`
   - **Chips:**
     - `{ label: 'Thêm người thân', actionType: 'open_emergency_contact', href: '/settings', variant: 'primary' }`
     - `{ label: 'Tự khóa chuyển tiền', actionType: 'navigate_security_hub', href: '/settings', variant: 'secondary' }`
     - `{ label: 'Để sau', actionType: 'dismiss', variant: 'ghost' }`

5. **Kịch bản `BT1 / BT2` - Làm quen bảo mật / Điểm bảo mật thấp (`id: 'security:bt1_onboarding'`):**
   - **Trigger:** `securitySummary?.isNewUserOnboarding` hoặc `(securitySummary?.score !== undefined && securitySummary.score < 80)`.
   - **Title:** `"Bạn đã biết những phương thức bảo mật của MSB chưa?"`
   - **ImpactLine:** `"Điểm bảo mật: {score}/100. Bật mã chống giả mạo (+15) và thêm người thân khẩn cấp (+10) để lên mức Cao."`
   - **BadgeText:** `"Bảo mật · Xanh"`
   - **Chips:**
     - `{ label: 'Xem 3 thủ đoạn phổ biến', actionType: 'open_security_handbook', variant: 'primary' }`
     - `{ label: 'Trung tâm bảo mật', actionType: 'navigate_security_hub', href: '/settings', variant: 'secondary' }`

6. **Kịch bản `ALL_CLEAR` - Fallback Bảo mật Xanh Bắt buộc (`id: 'security:all_clear'`):**
   - **Trigger:** Luôn được tạo làm fallback khi không có ứng viên `SECURITY` nào ở mục 1..5 được chọn.
   - **Title:** `"Tài khoản đang được Khiên bảo vệ M-Your canh gác 24/7."`
   - **ImpactLine:** `"Mọi giao dịch và đăng nhập gần đây đều an toàn, chưa phát hiện dấu hiệu bất thường."`
   - **BadgeText:** `"An toàn"`
   - **Chips:**
     - `{ label: 'Trung tâm bảo mật', actionType: 'navigate_security_hub', href: '/settings', variant: 'primary' }`
     - `{ label: 'Xem 3 thủ đoạn phổ biến', actionType: 'open_security_handbook', variant: 'secondary' }`

---

## 3. Quy tắc Nhóm Tài chính (`domain: 'PFM'`) & Hàm Sắp xếp 5 Slides

1. **8 Nhóm PFM (Bảng 3):**
   - Giữ toàn bộ các detector PFM hiện có trong `snapshot.ts` (`UPCOMING_OBLIGATION`, `CASHFLOW_RISK`, `ANOMALY_LEAKAGE`, `GOAL_PROGRESS`, `OPTIMIZATION`, `PERIODIC_PULSE`, `RECOGNITION_RECAP`, `DISCOVERY_GUIDE`), gắn thêm `domain: 'PFM'` và mảng `chips` tương ứng.
   - Nếu danh sách PFM rỗng, luôn sinh 1 fallback PFM (`id: 'pulse:steady_state'`, `category: 'PERIODIC_PULSE'`, `title: 'Nhịp chi tiêu tuần này đang được duy trì ổn định.'`, `impactLine: 'Các hũ ngân sách và dòng tiền đều nằm trong ngưỡng an toàn.'`) để đảm bảo PFM luôn có từ **1 đến 3** cái.

2. **Thuật toán `selectOrderedHomeCandidates` trong `snapshot.ts`:**
   - **Bước 1:** Lọc các ứng viên `domain === 'PFM'`, chọn từ **1 đến 3** ứng viên theo thứ tự `priority` tăng dần (ưu tiên đa dạng `category` trước, nếu chưa đủ 3 thì lấy tiếp theo `priority`).
   - **Bước 2:** Lọc các ứng viên `domain === 'SECURITY'` (theo thứ tự ưu tiên `RED` -> `AMBER` -> `GREEN`), lấy tối đa **2** ứng viên. Nếu không có ứng viên nào, dùng `[allClearSecurityCandidate]` để đảm bảo luôn có từ **1 đến 2** ứng viên bảo mật.
   - **Bước 3:** Tách các ứng viên bảo mật đã chọn thành 2 mảng:
     - `urgentSecurity`: các thẻ có `securityLevel === 'RED' || securityLevel === 'AMBER'`.
     - `greenSecurity`: các thẻ có `securityLevel === 'GREEN'`.
   - **Bước 4:** Trả về mảng kết quả theo đúng công thức:
     `return [...urgentSecurity, ...selectedPfm, ...greenSecurity].slice(0, 5);`