# MSB Financial Copilot

A mock-data-first **personal financial management (PFM)** prototype for a Vietnamese bank (MSB), built around a **grounded, non-committing AI assistant**. All financial numbers come from a deterministic calculation engine; the AI explains, simulates, and *drafts* actions — it never becomes the ledger and never moves money on its own.

> Prototype status: the UI shell, deterministic engine, rule-based insights, mock providers, and the AI facade pipeline are implemented. User-facing copy and categories are Vietnamese.

## Product at a glance

The product ships in three progressive levels, gated by data coverage and user trust:

| Level | Name | What it delivers |
| ----- | ---- | ---------------- |
| **1** | Money visibility | Transactions, cash flow, basic net worth |
| **2** | Wealth picture | Assets, liabilities, goals, health indicators |
| **3** | Guided decisions & assisted actions | Bounded simulations, recommendations, and agent-prepared transaction **drafts** the human reviews, confirms, and authenticates |

See [`docs/PRODUCT.md`](docs/PRODUCT.md) for the full product contract.

## Architectural invariants

These constraints are the reason the architecture exists and must be preserved by any change:

1. **The deterministic engine is the source of financial truth** — never the LLM.
2. **The AI is a non-committing, constrained facade** with two tool tiers: read-only analytics and draft-only actions. It cannot mutate, execute, confirm, or authenticate anything.
3. **No autonomous money movement** — every transfer is reviewed, confirmed, and authenticated by the human in the native MSB flow.
4. **UI depends on provider interfaces, not fixtures.**
5. **Every number carries provenance** (`msb` / `self_reported` / `estimated` / `mock`).
6. **Missing values stay unknown** — never silently defaulted to zero.
7. **Categories are data**, not hard-coded in presentation.

Full rationale and the request pipeline are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Khai báo xuất xứ code và nguồn dữ liệu

### 1. Xuất xứ code

**Lịch sử phát triển.** Nền tảng ban đầu (khung ứng dụng, engine tính toán, hũ chi tiêu) được đội xây từ 09/2026 trong repo `pfm`. Trong giai đoạn thi (từ 16/10/2026), đội chuyển sang repo này và phát triển thêm các phần chính: workflow mục tiêu, chống gian lận, tra cứu tin tức thị trường, cùng việc nối agent với pfm. Repo này hiện có hơn 600 commit. Toàn bộ mã do các thành viên của đội viết (có hỗ trợ của Claude, xem hàng cuối bảng dưới).

| Thành phần | Nguồn |
| ---------- | ----- |
| Khung và thư viện | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Vitest. Thư viện chạy: `better-sqlite3`, `lucide-react` (biểu tượng), `recharts` (biểu đồ), `motion`, `zustand`, `react-markdown`, `remark-gfm` (phiên bản trong `package.json`). |
| Do đội viết trong repo này | Giao diện và luồng sản phẩm trong `src/`, engine tính toán tất định, các API `/api/*` (trong đó `/api/agent/*` chuyển tiếp tới agent), mô-đun mục tiêu `src/features/goals-preview/`, mô-đun bảo mật chống lừa đảo `src/lib/security/`, cơ sở dữ liệu và script trong `data/`, `scripts/`. |
| Agent | Trợ lý M-You chạy ở repo riêng `personal-pfm-agent`; pfm chỉ gọi qua HTTP. |
| Công cụ AI hỗ trợ lập trình | Phần lớn mã được viết với sự hỗ trợ của Claude (Anthropic); các dòng `Co-Authored-By` trong lịch sử git ghi lại những commit có sự tham gia đó. Đội chịu trách nhiệm về toàn bộ mã nộp, logic tài chính có kiểm thử tất định đi kèm. |

### 2. Mô hình LLM sử dụng

pfm **không tự chạy mô hình** cho chat hay phân tích: mọi tính năng AI của trợ lý M-You (chat, gợi ý mục tiêu, lộ trình, chống lừa đảo) do agent `personal-pfm-agent` thực hiện, pfm chỉ chuyển tiếp qua `/api/agent/*`. Mô hình mà agent dùng được khai báo trong README của repo đó.

| Mục đích | Mô hình | Ghi chú |
| -------- | ------- | ------- |
| Tự phân loại giao dịch (`/api/agent/categorize`, `src/ai/llm`) | Tùy chọn: gọi GreenNode / VNG Cloud MaaS, mô hình mặc định `qwen/qwen3.8-flash` (đổi bằng `LLM_MODEL`) | Chỉ chạy khi cấu hình `AI_PLATFORM_API_KEY`. Không có khóa (hoặc `LLM_PROVIDER=none`) thì tuyến trả 501 và ứng dụng dùng bộ phân loại luật cục bộ `src/ai/categorize/local-classifier.ts`, không gọi mô hình nào. Có thể tắt hẳn bằng `NEXT_PUBLIC_ENABLE_AUTO_CATEGORIZE=false`. |
| Nhận dạng giọng nói | Dịch vụ STT riêng (`STT_API_BASE_URL`); pfm chỉ tạo phiên và nhận kết quả, mô hình do dịch vụ đó cung cấp | Dịch vụ triển khai riêng |

Mô hình không bao giờ là nguồn của số liệu tài chính: engine tất định của pfm là nguồn sự thật.

### 3. Nguồn dữ liệu

| Dữ liệu | Loại | Chi tiết |
| ------- | ---- | -------- |
| Khách hàng, tài khoản, giao dịch, hũ, mục tiêu (`data/pfm.sqlite3`) | Giả lập (synthetic) | Bốn persona mẫu tạo bằng `scripts/seed-db.mjs` và các script seed. Giao dịch gắn nhãn `source: mock` (gần như toàn bộ), bản ghi người dùng nhập tay gắn `self_reported`; xem `docs/PRODUCT.md` mục Mock-data strategy và `docs/DATA-READINESS.md`. Không dùng dữ liệu khách hàng thật của MSB. |
| Giá vàng | API công khai | Lịch sử vàng SJC từ VNAppMob (`scripts/fetch-gold-history.mjs`), giá vàng PNJ từ API công khai của PNJ. |
| Quỹ mở | API công khai | Danh mục và giá từ Fmarket (`scripts/sync-fund-directory.mjs`). |
| Cổ phiếu | API công khai | Danh mục và giá từ VNDirect (`scripts/sync-stock-directory.mjs`). |
| Tham chiếu sản phẩm MSB (`data/msb-reference.json`: khuyến mãi, danh mục) | Tự soạn (nhãn `source: mock`) | Do đội soạn cho prototype, không phải dữ liệu chính thức của MSB. |
| Hũ mẫu (`data/seed-jars.json`) | Tự soạn | Do đội soạn cho prototype. Kịch bản lừa đảo dùng bởi pfm nằm ở repo `personal-pfm-agent` (`data/fraud_playbook.json`). |

## Tech stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS v4**
- **Recharts** (charts) · **lucide-react** (icons)
- **Vitest** + **Testing Library** (tests)
- **LLM facade** (`src/ai/llm`, server-only): gọi GreenNode MaaS qua HTTP bằng chuẩn chat-completions, không cần SDK riêng; tắt được để chạy offline

## Getting started

**Prerequisites:** Node.js `>=20` (see [`.nvmrc`](.nvmrc)) and npm.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional — the app runs offline without a key)
cp .env.example .env.local   # then fill in an LLM key if you want live AI

# 3. Start the dev server
npm run dev                  # http://localhost:3000
```

The assistant degrades to deterministic templated answers when no LLM key is configured, so the app always builds and runs.

### Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint with ESLint (`next/core-web-vitals`) |
| `npm run test` | Run the test suite once (`vitest run`) |
| `npm run test:watch` | Run tests in watch mode |

### Environment variables

Server-side only — keys never reach the browser bundle. Copy [`.env.example`](.env.example) to `.env.local` (gitignored).

| Variable | Purpose |
| -------- | ------- |
| `LLM_PROVIDER` | `vng` (GreenNode MaaS; picked automatically when `AI_PLATFORM_API_KEY` is set) · `none` (force offline) |
| `AI_PLATFORM_API_KEY` | Key for the GreenNode MaaS provider (`LLM_PROVIDER=vng`; leave empty for offline mode) |
| `LLM_BASE_URL` | Optional base URL override for the GreenNode MaaS provider |
| `LLM_MODEL` | Optional model override (sensible per-provider defaults otherwise) |

## Project structure

```
msb-pfm/
├── docs/                     # Source-of-truth product & architecture docs
│   ├── PRODUCT.md            #   what the product is
│   ├── ARCHITECTURE.md       #   how it is built
│   └── journals/             #   session journals
├── src/
│   ├── app/                  # Next.js App Router routes + /api/assistant
│   ├── components/           # React components, grouped by feature area
│   ├── domain/               # Deterministic calculation engine + data models
│   │   ├── engine/           #   pure, independently tested financial rules
│   │   └── models/           #   canonical types + Vietnamese category taxonomy
│   ├── insights/             # Rule-based (deterministic) insight detectors
│   ├── ai/                   # AI facade: LLM adapters, tools, pipeline, audit
│   │   ├── llm/              #   provider-neutral client + adapters (server-only)
│   │   ├── tools/            #   whitelisted read tools + draft-only tools
│   │   ├── pipeline/         #   intent → scope → tools → narrative → validation
│   │   ├── proactive/        #   bounded chat openers from existing insights
│   │   └── audit/            #   metadata-only audit events
│   ├── providers/            # Data provider interfaces + swappable mock provider
│   ├── state/                # React state (financials, insights, consent, period)
│   └── lib/                  # Framework-agnostic utilities
├── next.config.ts
├── tsconfig.json             # `@/*` → `src/*` path alias
└── vitest.config.ts
```

The `src/` layout follows Next.js's recommended "top-level folders" strategy and mirrors the module boundaries documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The `domain`, `insights`, and `ai` split is intentional: deterministic truth, deterministic insights, and the LLM facade are kept separate on purpose.

## Testing

```bash
npm run test
```

Calculation correctness is a hard gate: every financial rule has a deterministic test against fixtures, and AI numeric claims must trace to structured facts. Cover empty, loading, error, and insufficient-data states for every feature.

## Documentation

| Document | Purpose |
| -------- | ------- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Personas, the three PFM levels, screens, scope, and the AI product contract |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module responsibilities, data model, provider abstraction, AI pipeline, evolution path |
| [`CLAUDE.md`](CLAUDE.md) | Working conventions and the architectural invariants |

> Working docs (the phased plans, backlog, and research reports under `plans/`) are kept local-only and are not tracked in version control.

## Conventions

- Follow the backlog dependency order — no Level 3 work bypasses the Level 1 calculation and data-quality foundation.
- When implementing a financial rule, add a deterministic fixture test in the same change.
- Non-component `.ts` files use `kebab-case`; React components use `PascalCase`; hook files use the `useX` convention.
- Conventional Commits for commit messages.

## License

Proprietary — internal MSB prototype. Not licensed for external use or distribution.
