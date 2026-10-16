---
type: validation-report
subject: plans/project-backlog.md
product: MSB AI Personal Financial Management
date: 2026-09-03
verdict: needs-changes
scope: development-phase readiness
---

# Báo cáo Validate Backlog — Giai đoạn Phát triển

Đối tượng: `plans/project-backlog.md`
Đối chiếu nguồn: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`
Ngày: 2026-09-03

## 1. Kết luận tổng quan

Backlog có chất lượng tốt về tư duy sản phẩm — ưu tiên theo dependency và trust risk, release gates rõ ràng, Definition of Done chặt chẽ. Tuy nhiên **chưa sẵn sàng để bắt đầu code (not dev-ready)**: thiếu một số hạng mục P0 quan trọng, thiếu nền tảng kỹ thuật, và phần lớn item chưa có acceptance criteria đủ để giao việc.

**Trạng thái: ⚠️ NEEDS CHANGES** — cần bổ sung/sửa trước khi mở sprint đầu tiên.

| Nhóm | Số lượng |
|---|---|
| 🔴 Nghiêm trọng (chặn/rủi ro dev) | 5 |
| 🟡 Trung bình (bất nhất / underspec) | 5 |
| 🟢 Nhỏ | 3 |

## 2. Vấn đề nghiêm trọng

### C1 — Thiếu hoàn toàn epic/item cho Budget (ngân sách)
- **Bằng chứng:** `PRODUCT.md` §Scope by PFM level liệt kê "budgets" trong capabilities của Level 1; insight mẫu dùng "Bạn còn 12 ngày nhưng đã dùng 82% ngân sách giải trí". Backlog không có PFM item nào về budget.
- **Ảnh hưởng:** Một tính năng thuộc phạm vi P0 của Level 1 không có đường vào backlog.
- **Đề xuất:** Thêm `PFM-025 — Budget/ngân sách theo danh mục` (P0) vào EPIC-03 hoặc tách epic riêng (tạo, theo dõi % đã dùng, cảnh báo vượt ngân sách).

### C2 — Không có item dựng màn hình Overview
- **Bằng chứng:** `PRODUCT.md` §Primary screens xác định "PFM Overview" là màn hình #1 (net worth, available cash, income, expense, upcoming obligations, top insights). PFM-001 chỉ điều hướng "Returning user lands on Overview", giả định màn hình đã tồn tại.
- **Ảnh hưởng:** Màn hình trung tâm của app không có ai được giao xây dựng.
- **Đề xuất:** Thêm `PFM-035 — Màn hình PFM Overview` (P0) vào EPIC-04, tổng hợp dữ liệu từ cash-flow/net-worth/insight.

### C3 — Không có epic nền tảng kỹ thuật
- **Bằng chứng:** Backlog bắt đầu ngay tại PFM-001 (feature). Repo hiện chưa có code, build tooling, hay tech-stack được chọn.
- **Ảnh hưởng:** Không thể bắt đầu PFM-001 khi chưa có khung dự án, CI/CD, design-system/component base.
- **Đề xuất:** Thêm `EPIC-00 — Nền tảng kỹ thuật` (P0): chọn stack, scaffolding, lint/test/CI, hệ component + design tokens, cấu trúc thư mục theo modular monolith.

### C4 — Thiếu item consent revocation + xóa/xuất dữ liệu
- **Bằng chứng:** `ARCHITECTURE.md` §Consent and audit có trường `revokedAt`; `PRODUCT.md` §Main risks nêu mitigation "deletion/export path"; tham chiếu Nghị định 13/2023/NĐ-CP. Backlog chỉ có PFM-003 (disclosure).
- **Ảnh hưởng:** Rủi ro tuân thủ pháp lý về bảo vệ dữ liệu cá nhân bị bỏ sót.
- **Đề xuất:** Thêm `PFM-094 — Thu hồi consent + xóa/xuất dữ liệu` (P0/P1) vào EPIC-10.

### C5 — Thiếu contract tests cho provider adapters
- **Bằng chứng:** `ARCHITECTURE.md` §Testing strategy yêu cầu "Contract tests for provider adapters". EPIC-12 chỉ có calc suite (PFM-110), AI grounding (PFM-111), a11y (PFM-112), e2e (PFM-113). PFM-011 định nghĩa interface nhưng không có item test.
- **Ảnh hưởng:** Invariant kiến trúc "mock provider swappable without changing domain calculations" không được test bảo vệ.
- **Đề xuất:** Thêm `PFM-114 — Provider adapter contract tests` vào EPIC-12 (P0/P1).

## 3. Vấn đề trung bình

### M1 — Xung đột nhãn P0–P4
Release map dùng `P0..P4` làm *tên release*, còn Priority legend dùng `P0..P2` làm *mức ưu tiên*. Hệ quả: "Release P2 Level 2" chứa toàn item priority **P1** (PFM-040..043). Gây nhầm lẫn khi lập kế hoạch sprint.
- **Đề xuất:** Đổi tên release thành `R0..R4` (hoặc "Release 1/2/3"), tách biệt hẳn khỏi thang priority.

### M2 — Đảo ngược dependency ở net worth
PFM-033 (Basic net worth, **P0**) cần dữ liệu liability, nhưng Liability registry PFM-041 là **P1/Level 2**. Đọc được qua fixtures (PFM-010 đã bao gồm liabilities) nên không bế tắc.
- **Đề xuất:** Ghi rõ trong acceptance criteria của PFM-033: net worth P0 đọc liability từ fixture/provider, không phụ thuộc UI registry của Level 2.

### M3 — Phần lớn item P0/P1 thiếu acceptance criteria
Chỉ ~10/40 item có AC rõ. Thiếu AC ở PFM-020, 022, 031, 032, và gần như toàn bộ EPIC-05/06/08/09.
- **Ảnh hưởng:** Chưa đạt "Definition of Ready" để giao dev; dễ hiểu sai phạm vi.
- **Đề xuất:** Bổ sung AC tối thiểu 2–3 dòng cho mỗi item P0/P1 trước sprint planning.

### M4 — PFM-034 (Net-worth trend, P1) thiếu dữ liệu nguồn
Cần lịch sử net worth theo thời gian, nhưng fixture schema PFM-010 chỉ nêu "6 tháng *transactions*", không đề cập snapshot lịch sử asset/liability.
- **Đề xuất:** Bổ sung yêu cầu dữ liệu lịch sử (snapshot asset/liability theo tháng) vào acceptance criteria của PFM-010.

### M5 — Không có epic observability/instrumentation
`ARCHITECTURE.md` §Observability yêu cầu theo dõi sync freshness, categorization confidence, calc errors, AI tool-call latency, grounding failures, feedback. Hiện chỉ rải rác trong DoD ("Analytics event is defined…").
- **Đề xuất:** Gom thành item riêng (ví dụ `PFM-102 — Observability & metrics`) trong EPIC-11/12, priority P1/P2.

## 4. Vấn đề nhỏ

### L1 — Bất nhất số lượng persona
`PRODUCT.md` §Mock-data strategy nói "one sample customer"; PFM-012 yêu cầu "at least three personas". Không mâu thuẫn cứng nhưng nên đồng bộ câu chữ.

### L2 — Thiếu ước lượng effort/sizing và Definition of Ready
Backlog có Definition of Done nhưng chưa có tiêu chí vào việc (Definition of Ready) hay sizing/estimate cho sprint planning.

### L3 — Thiếu cơ chế delivery cho insight
`PRODUCT.md` §Main risks nêu mitigation "insight fatigue: digest limits, severity tiers". PFM-062/063 mới cover dismiss/snooze/monthly brief, chưa có item về digest/notification delivery.

## 5. Điểm mạnh (giữ nguyên)

- Thứ tự phụ thuộc P0 tạo lát cắt Level 1 mạch lạc và tự đủ: transactions → cash flow → net worth → rule-based insight → grounding test.
- Nguyên tắc "visibility before advice" phản ánh đúng: PFM-060/061 (insight detector + evidence) là P0, PFM-062 (AI narrative) là P1 — engine deterministic đi trước LLM.
- Release gates (Level 1/2/3/Pilot) và Definition of Done bao phủ tốt các invariant cốt lõi: transfers không méo số liệu, nhãn nguồn/độ tươi, không hành động tự động.

## 6. Ma trận độ phủ (Product/Architecture → Backlog)

| Yêu cầu nguồn | Item backlog | Trạng thái |
|---|---|---|
| Transaction feed, category, correction, merchant, recurring | PFM-020..024 | ✅ Đủ |
| Cash flow + forecast | PFM-030..032 | ✅ Đủ |
| Basic net worth + trend | PFM-033, 034 | ⚠️ Thiếu dữ liệu lịch sử (M4) |
| **Budget** | — | 🔴 Thiếu (C1) |
| **Overview screen** | — | 🔴 Thiếu (C2) |
| Assets / Liabilities / Debt health | PFM-040..043 | ✅ Đủ |
| Goals + financial health | PFM-050..052 | ✅ Đủ |
| AI insight engine + grounding | PFM-060..063, 111 | ✅ Đủ |
| AI assistant + safety | PFM-070..073 | ✅ Đủ |
| Recommendation / simulation | PFM-080..083 | ✅ Đủ |
| Consent disclosure | PFM-003 | ⚠️ Thiếu revoke/delete/export (C4) |
| Source/freshness labels, AI audit | PFM-090, 091 | ✅ Đủ |
| Provider interfaces | PFM-011 | ⚠️ Thiếu contract test (C5) |
| **Tech foundation / CI / design-system** | — | 🔴 Thiếu (C3) |
| **Observability** | — | 🟡 Thiếu epic riêng (M5) |
| Calculation / a11y / e2e tests | PFM-110, 112, 113 | ✅ Đủ |

## 7. Khuyến nghị hành động (theo thứ tự ưu tiên)

1. Thêm `EPIC-00 — Nền tảng kỹ thuật` (P0) — điều kiện tiên quyết cho mọi item.
2. Thêm `PFM-025 — Budget` (P0), `PFM-035 — Overview screen` (P0).
3. Thêm `PFM-094 — Consent revocation + delete/export` (P0/P1).
4. Thêm `PFM-114 — Provider adapter contract tests`.
5. Đổi tên release map `P0..P4` → `R0..R4`.
6. Bổ sung dữ liệu lịch sử vào AC của PFM-010; làm rõ phạm vi P0 của PFM-033.
7. Rà soát bổ sung acceptance criteria cho các item P0/P1 còn thiếu.
8. Gom observability thành item riêng; đồng bộ số persona (PRODUCT vs PFM-012).

## 8. Câu hỏi mở

- Tech-stack đã được chốt chưa (frontend/backend/DB)? Ảnh hưởng nội dung EPIC-00.
- Budget thuộc Level 1 hay Level 2? `PRODUCT.md` xếp Level 1, cần xác nhận priority.
- Prototype có cần cơ chế chọn/đổi persona trên UI không (phục vụ demo 3 personas)?
