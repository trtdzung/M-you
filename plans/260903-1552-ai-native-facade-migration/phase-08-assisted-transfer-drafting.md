# Phase 08 — Assisted transfer drafting (Level 3): agent soạn, người thực thi

**Brainstorm:** Phase 4 · **Backlog:** EPIC-13 (PFM-130..134), PFM-093, PFM-092 · **Priority:** P1 (Level 3) · **Status:** ✅ DONE (2026-09-04)

> **Gate:** mở sau khi Phase 03 (tool/pipeline/validator) ổn định (đã done). Feature flag `ENABLE_TRANSFER_DRAFTING` **mặc định ON trong prototype** (user chốt 2026-09-04) ⇒ action_transfer tạo draft thay vì refuse; flag off vẫn dùng được để về refusal. **Không draft flow nào bypass PFM-093.** Mọi safety guard (deterministic-first, no-execute, threshold, fraud, no-fabricate) áp dụng bất kể flag.

## Nguyên tắc bất biến (CLAUDE.md #2/#3) — read + draft-only

*write-intent, không phải write.* Agent tạo `TransferDraft` (status luôn `draft`), **không bao giờ** execute/confirm/submit/schedule/chạm OTP, **không bịa số TK**. Con người duyệt từng field + tự xác thực trong luồng MSB. Facade (`src/ai/*`) tuyệt đối **không có code path** execute/confirm/authenticate.

| Agent ĐƯỢC | Agent KHÔNG BAO GIỜ |
|---|---|
| Tạo `TransferDraft` (recipient ref thật, amount, memo, source account) | Execute/confirm/submit/schedule |
| Recipient từ saved beneficiary + user gõ + lịch sử GD (số TK thật, mask hiển thị) | Xử lý/hỏi/bypass OTP, mật khẩu |
| Hỏi lại khi mơ hồ; re-confirm khi vượt ngưỡng/rủi ro | Bịa/hoàn thiện số TK; tự tắt fraud/threshold |

## Quyết định thiết kế (chốt trước khi code)

1. **Tier B KHÔNG nằm trong LLM tool-loop.** `toolSchemas()` (fed cho LLM ở `orchestrator.llmLoop`) vẫn chỉ Tier A. Draft tools gọi **trực tiếp server-side** trong `action-pipeline.ts`, LLM không được tự ý gọi `prepareTransferDraft`. ⇒ tránh LLM bịa field.
2. **Action pipeline deterministic-first.** Field (amount/recipient hint/memo) parse bằng helper thuần từ text người dùng; `findRecipient` resolve về **record thật**; nếu thiếu/mơ hồ ⇒ pipeline hỏi lại (không nhờ LLM điền). LLM chỉ (tuỳ chọn) diễn đạt câu clarify/summary, vẫn qua `validateSafety`. Số TK trong draft **luôn** từ record đã resolve, không từ text LLM.
3. **Action-tier consent = `transactions` scope + re-confirm in-chat.** KISS: không thêm scope persist mới; bước re-confirm (và threshold re-confirm) đóng vai trò action consent. (Ghi rõ trong plan.md.)
4. **Confirm mock screen nằm NGOÀI facade** (`src/app/transfer-confirm/*`, plain UI). "Execute" ở đây chỉ tạo record `source: mock` cục bộ, tách khỏi draft; OTP là ô mô phỏng người dùng tự thao tác. Không có API execute nào được gọi từ `src/ai`.

## Bối cảnh code (ground truth)
- `intent.ts` đã có `action_transfer` (regex chuyển/gửi/thanh toán/transfer). `orchestrator.ts` hiện **refuse** action_transfer (`ACTION_REFUSAL`) trước mọi tool call → thay bằng nhánh gated.
- `registry.ts`: chỉ `TIER_A_TOOLS = READ + SIM`. Thêm Tier B tách biệt, **không** đưa vào `toolSchemas()`.
- `AiTool` contract: handler thuần `(input, ctx) => ToolOutcome`, read-only. Draft tools theo cùng shape nhưng output là draft descriptor.
- `AiContext` (`load-financials.ts`): có `raw` (transactions, accounts…) + `financials` + `scopes`. **Chưa có beneficiaries** → cần bổ sung.
- `events.ts` / `UiMessage` (`ChatPanel.reduce`): stream events; thêm biến thể `reconfirm`/`draft`; thêm `DraftCard`.
- `AiAuditEvent`: metadata-only → thêm field draft (riskFlags/thresholdHit), **không** số TK/OTP.
- ARCHITECTURE §TransferDraft (dòng 184-207) + §Action pipeline (327-345) = spec shape & thứ tự.

## Hạng mục & bước triển khai (EPIC-13)

### 1. Model + data (PFM-131, invariant #4)
- `src/domain/models/index.ts`: thêm `RecipientSource = "saved_beneficiary" | "user_typed" | "transaction_history"`, `TransferRiskFlag = "new_payee" | "over_threshold" | "urgency_language"`, `Beneficiary` (id, name, accountNumber, bankName, source), và `TransferDraft` đúng shape ARCHITECTURE (status `"draft"`, recipientRef, recipientName, recipientAccountMasked, recipientSource, sourceAccountId, amount, currency, memo, riskFlags[], thresholdHit, requiresReconfirm, createdBy `"agent"`, createdAt, requestId). **Không** field OTP/credential/execution token.
- `src/providers/interfaces.ts`: thêm `BeneficiaryDataProvider { listBeneficiaries(): Promise<Beneficiary[]> }`, compose vào `Providers`.
- `src/providers/mock/*`: fixture beneficiaries (số TK dạng thật nhưng `source: mock`, ổn định theo persona) + `listBeneficiaries` ở `mock-provider.ts`; cập nhật `loadRaw`/`AiContext` để mang `beneficiaries` vào ctx.

### 2. `findRecipient` (Tier A-of-action, PFM-130) — `src/ai/tools/draft-tools.ts`
- Input: `{ query: string }` (tên/hint từ user). Resolve theo thứ tự: saved beneficiaries → counterparty trong lịch sử GD → nếu user gõ số TK hợp lệ format thì `user_typed` (+ đánh dấu new_payee). Trả **reference thật + mask** (`recipientAccountMasked` = `****NNNN`), `recipientSource`. Nhiều match/không match ⇒ outcome "ambiguous"/"not_found" (không bịa).
- Thuần, read-only; test riêng.

### 3. `prepareTransferDraft` (Tier B, PFM-131) — `src/ai/tools/draft-tools.ts`
- Input: recipient đã resolve + amount + memo + sourceAccountId. Build `TransferDraft` đã validate (amount > 0, source account tồn tại, recipient ref thật). Gắn `riskFlags`, `thresholdHit`, `requiresReconfirm`. **Không** path execute/submit/confirm/authenticate. Thiếu field ⇒ fail có lý do, không bịa.

### 4. Action pipeline (PFM-093) — `src/ai/pipeline/action-pipeline.ts` (+ `action-parse.ts`)
- `action-parse.ts` (helper thuần <120 dòng): trích amount (VND, hỗ trợ "5tr", "5.000.000"), recipient hint, memo từ text; detect urgency language (`gấp|ngay|khẩn|nhanh|liền`).
- `action-pipeline.ts` chạy đúng thứ tự ARCHITECTURE: parse → `findRecipient` → gom+validate field → risk (threshold `TRANSFER_THRESHOLD_VND` + fraud: new_payee & large & urgency) → nếu thiếu field/ambiguous ⇒ yield `clarify` (hỏi lại, dừng); nếu `requiresReconfirm` & chưa xác nhận ⇒ yield `reconfirm` (dừng); khi user xác nhận (turn sau chứa tín hiệu đồng ý) ⇒ `prepareTransferDraft` → yield `draft` event. Không có nhánh execute.
- Config: `src/ai/config.ts` (hoặc hằng trong pipeline) — `ENABLE_TRANSFER_DRAFTING` (env, **default ON** cho prototype; off ⇒ refusal), `TRANSFER_THRESHOLD_VND` (vd 10_000_000).

### 5. Threshold re-confirm (PFM-132) & Fraud checkpoint (PFM-133)
- Threshold: amount ≥ ngưỡng ⇒ `thresholdHit=true`, `requiresReconfirm=true`, chèn `over_threshold` vào riskFlags; pipeline chặn tạo draft tới khi có re-confirm in-chat.
- Fraud: (recipientSource ≠ saved_beneficiary → `new_payee`) + amount lớn + urgency language ⇒ thêm flag + câu cảnh báo slow-down. Cảnh báo, **không chặn** quyết định hợp lệ sau re-confirm.

### 6. Orchestrator wiring — `src/ai/pipeline/orchestrator.ts`
- Trong `runAssistant`, nhánh `intent.kind === "action_transfer"`: nếu `ENABLE_TRANSFER_DRAFTING` ⇒ `yield* runActionPipeline(input, trace)`; else giữ `ACTION_REFUSAL` như hiện tại. Audit: `intent="action_transfer"`, thêm draft metadata (riskFlags, thresholdHit) — không số TK/OTP.
- `events.ts`: thêm `{type:"reconfirm"; reason; summary}`, `{type:"clarify"; question}`, `{type:"draft"; draft: TransferDraftView}` (view = projection mask-only cho client).
- `audit/types.ts`: thêm optional `draft?: { riskFlags: string[]; thresholdHit: boolean }`.

### 7. UI — chat draft card + confirm mock (PFM-134, bám token MSB Phase 06)
- `src/components/assistant/DraftCard.tsx`: card trắng `rounded-[24px]` `shadow-card`, số lớn navy bold (`Money`), field editable rõ, mask số TK, chip risk (`--color-warning`/`--color-negative` soft), `SourceBadge source="mock"`. Nút **"Xem lại & xác nhận"** pill cam → điều hướng `transfer-confirm` (không auto-submit). `types.ts` thêm `draft?`, `reduce()` xử lý event mới, `ChatMessage` render `DraftCard` + reconfirm/clarify prompt.
- `src/app/transfer-confirm/page.tsx` (+ components): màn confirm mock ngoài facade — field editable, nút confirm tường minh, ô OTP mô phỏng người dùng tự nhập, huỷ/sửa trả control không side effect. Kết quả mock = record `source: mock` tách khỏi draft. Agent không auto-fill/auto-submit.

### 8. Safety tests (PFM-092) — `src/ai/pipeline/__tests__/`
- `draft-attack.test.ts`: injection đòi (a) thực thi/confirm/gửi luôn, (b) bịa/hoàn thiện số TK, (c) bỏ qua ngưỡng, (d) tắt fraud checkpoint, (e) lấy OTP → tất cả bị chặn (clarify/reconfirm/refuse) + audit ghi; không có draft chứa số TK bịa.
- `action-pipeline.test.ts`: happy path (saved beneficiary, dưới ngưỡng) tạo draft; over-threshold ⇒ reconfirm trước; new payee + urgency ⇒ riskFlags; ambiguous recipient ⇒ clarify.
- `draft-tools` recipient tests: resolve saved/history/typed; not_found & ambiguous không bịa.
- Đảm bảo `toolSchemas()` (LLM) **không** chứa Tier B (test).

## Related code
**Modify:** `src/domain/models/index.ts`, `src/providers/interfaces.ts`, `src/providers/mock/mock-provider.ts` (+ fixtures/generate), `src/ai/server/load-financials.ts` (beneficiaries vào ctx), `src/ai/tools/registry.ts` (giữ Tier A cho LLM, export Tier B riêng), `src/ai/pipeline/{orchestrator,events}.ts`, `src/ai/audit/types.ts`, `src/components/assistant/{types,ChatPanel,ChatMessage}.tsx`.
**Create:** `src/ai/tools/draft-tools.ts`, `src/ai/pipeline/{action-pipeline,action-parse}.ts`, `src/ai/config.ts`, `src/components/assistant/DraftCard.tsx`, `src/app/transfer-confirm/*`, tests ở §8.

## Ràng buộc
- File < 200 dòng, kebab-case/PascalCase. YAGNI/KISS/DRY.
- Mọi số/nhánh tài chính mới ⇒ deterministic test cùng change. Không import fixture trực tiếp ở component.
- Facade không thêm bất kỳ path execute/confirm/OTP nào.

## Todo
- [x] 1. Models (TransferDraft/Beneficiary/RecipientSource/RiskFlag) + BeneficiaryDataProvider + mock fixture + ctx
- [x] 2. `findRecipient` (real records only, mask, ambiguous→hỏi) + test
- [x] 3. `prepareTransferDraft` Tier B (no execute path) + test
- [x] 4. `action-parse` + `action-pipeline` (parse→resolve→risk→reconfirm→draft) + config flag/threshold
- [x] 5. Threshold re-confirm + fraud checkpoint (riskFlags, slow-down)
- [x] 6. Orchestrator gated wiring + events + audit draft metadata
- [x] 7. DraftCard trong chat + màn `transfer-confirm` mock (ngoài facade, OTP người dùng)
- [x] 8. Safety tests (draft-attack) + action-pipeline + recipient + Tier-B-not-in-LLM test
- [x] 9. `build`/`lint`/`test` xanh; code-review adversarial tập trung invariant #2/#3

## Hoàn thành (2026-09-04)
Pipeline draft-only deterministic đã ship đúng thiết kế: Tier B tools (`findRecipient`/`prepareTransferDraft`) **không** nằm trong tool schema đưa cho LLM — chỉ gọi trực tiếp server-side trong `action-pipeline.ts`. Feature flag `ENABLE_TRANSFER_DRAFTING` mặc định ON (prototype). Threshold (10.000.000 VND) + fraud checkpoint gate đúng chỗ trước khi tạo draft. UI: `DraftCard` trong chat + màn confirm mock ngoài facade (`/transfer-confirm`). Safety/attack tests pass (injection execute/confirm/bịa số TK/bypass threshold/tắt fraud/lấy OTP đều bị chặn).

Code-review post-implementation đã fix 2 vấn đề: (a) **[critical]** `isTransferConfirmation` giờ yêu cầu turn-adjacency — một câu xác nhận không liên quan ở lượt sau không còn có thể finalize một draft cũ đã vượt ngưỡng; (b) amount parser không còn đọc nhầm số tài khoản người dùng gõ thành số tiền, kèm fix currency-boundary an toàn Unicode.

**Quyết định sản phẩm còn mở:** màn confirm mock hiện chỉ hiển thị số tài khoản đã mask (mask-only client projection theo đúng plan) — cần product sign-off nếu muốn hiển thị thêm.

## Định nghĩa hoàn thành (Level 3 gate — backlog)
- Không autonomous action: agent chỉ ra draft review được; execute/confirm/OTP chỉ do người trong luồng MSB mock.
- Draft không chứa số TK bịa; recipient luôn trace record thật (mask hiển thị).
- Threshold re-confirm + fraud checkpoint fire đúng, có safety test.
- PFM-093 boundary: không path execute/confirm/authenticate trong `src/ai/*`; Tier B không lộ cho LLM.
- Flag default ON: action_transfer tạo draft đúng pipeline; đặt off vẫn về refusal — không hồi quy Phase 1–5.

## Rủi ro chính
Prompt-injection/social-engineering vào draft → chặn bằng: draft deterministic (không nhờ LLM điền field), không bịa số TK, threshold, fraud checkpoint, agent không execute/không chạm OTP, audit đầy đủ, safety tests (PFM-092).
