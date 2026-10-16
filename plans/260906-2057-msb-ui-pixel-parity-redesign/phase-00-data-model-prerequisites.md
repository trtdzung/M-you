# Phase 00 — Data-model prerequisites (chặn Phase 03)

**Context links:** [plan.md](plan.md) · CLAUDE.md invariants #4/#5/#6/#7 · Red Team finding #1
**Nguồn:** Red team (Assumption Destroyer A1/A2/A4 + Security SEC2/SEC3) — 3 element headline của Home **không có field** trong data model → nếu không làm phase này, Phase 03 buộc phải bịa số.

## Overview
- **Priority:** P0 — **BLOCKER cho Phase 03**
- **Status:** done
- Bổ sung các field dữ liệu mà Home MSB cần (hạng TK, số TK mask) **đúng chuẩn provenance**, để Phase 03 không vi phạm bất biến "mọi số có nguồn / không bịa".

## Key insights (đã verify với source)
- `src/domain/models/index.ts` — `Account` = `{ id, type, institution, currency, balance, availableBalance, lastSyncedAt, source }`. **Không có** `tier` (M-FIRST GOLD) và **không có** số TK.
- `MockProduct` / `Insight` **không có** field "% hạn mức lương" → **không** dựng số "75%" từ dữ liệu thật.
- Chỉ `Beneficiary` có `accountNumber`; `Account` thì không.

## Requirements
- **FR:** `Account` có `tier?: string` (hạng, vd "M-FIRST GOLD") và `maskedNumber: string` (hiển thị last-4, vd `•••• 1991`); fixtures + `AccountDataProvider` cấp field mới; mọi field mới mang `source` (mock).
- **NFR:** không phá 125 test hiện có; thêm test cho field/format mới.
- **Bất biến:** field mới gắn `source: "mock"`; **không** thêm số bịa vào engine tính toán; số TK mask theo `maskAccount()` sẵn có (`src/ai/tools/draft-tools.ts`).

## Decisions (chốt trong phase này)
1. **Promo "75% hạn mức lური"** = **KHÔNG** dựng từ dữ liệu thật. Card ưu đãi trong carousel là **banner tĩnh `source:"mock"`**, không mang numeric claim gắn với tài chính người dùng. (Detector salary-limit là YAGNI cho prototype — không làm.)
2. Carousel card "insight thật" → **tái dùng `InsightCard`** (không bịa %), tách khỏi card promo tĩnh.
3. Số TK: lưu đầy đủ ở data mock nhưng **UI chỉ render last-4** (mask mặc định), không có nút reveal toàn bộ số (khác balance có eye toggle).

## Related code files
- **Modify:** `src/domain/models/index.ts` (`Account` thêm `tier?`, `maskedNumber`), `src/providers/mock/*` (fixtures/generate cấp field), `src/providers/interfaces.ts` (nếu cần), `src/lib/format.ts` (helper mask số TK nếu chưa dùng chung được)
- **Create:** test cho field/format mới (cùng change)
- **Read:** `src/ai/tools/draft-tools.ts` (`maskAccount`), `src/providers/mock/personas.ts`

## Implementation steps
1. Thêm `tier?: string` + `maskedNumber: string` vào `Account` (JSDoc ghi rõ `source: mock`).
2. Cập nhật fixtures/generate + mock provider để mọi account có `maskedNumber`; account chính có `tier`.
3. Tách/thống nhất helper mask số TK (dùng lại `maskAccount` hoặc thêm ở `format.ts`), có test.
4. Chạy `vitest` — sửa nếu test fixture/shape vỡ. Thêm test: account có `maskedNumber` hợp lệ + đúng `source`.
5. Xác nhận `computeFinancials` / engine **không** dùng field mới cho phép tính (thuần hiển thị).

## Todo
- [x] `Account.tier?` + `Account.maskedNumber` (JSDoc source:mock)
- [x] Fixtures/provider cấp field mới cho mọi account
- [x] Helper mask số TK dùng chung + test (`maskAccountNumber()` trong `src/lib/format.ts`)
- [x] Quyết định promo tĩnh (không detector %) ghi vào Phase 03
- [x] `vitest` xanh (148 test); lint/build xanh

## Success criteria
- Phase 03 lấy được `tier` + `maskedNumber` từ provider (không hard-code, không bịa).
- Mọi field mới có `source`; engine tài chính không đụng field hiển thị mới.
- Không số "%" nào ở Home gắn với dữ liệu tài chính người dùng mà thiếu nguồn.

## Risk & mitigation
- *Thêm field làm vỡ fixture/test:* chạy vitest ngay sau mỗi bước; cập nhật snapshot/shape.
- *Cám dỗ thêm detector salary-limit:* KHÔNG (YAGNI) — promo là banner tĩnh mock.

## Security
- Số TK mask mặc định (last-4), không reveal toàn bộ; không lộ PII mới.

## Next steps
→ Mở khoá Phase 03 (Home pixel-parity) với dữ liệu hợp lệ.
