# MSB design tokens — trích từ 4 screenshot thật (`ref-ui-msb/`)

> Nguồn: 4 ảnh app MSB thật (Home, Cài đặt, Tài sản, Danh sách dịch vụ). Đây là bảng token
> chuẩn để reskin. Hex là giá trị **xấp xỉ** đọc từ ảnh — implement bám các biến này, không
> rải hex rời rạc trong component.

## 1. Màu

### Brand
| Token | Hex | Dùng cho |
|---|---|---|
| `--brand-red` | `#E8321E` | Điểm đậm nhất của gradient (góc trên-trái hero, logo M) |
| `--brand-orange` | `#F5822C` | Điểm sáng của gradient |
| `--color-primary` | `#F26522` | Cam CTA / active / accent icon (thay crimson `#d81f36` cũ) |
| `--color-primary-fg` | `#FFFFFF` | Chữ trên nền cam |
| `--color-primary-soft` | `#FCE3D7` | Nền pill active (nav), nền chip nhạt |
| `--brand-gradient` | `linear-gradient(135deg, #EE3E24 0%, #F5822C 100%)` | Hero Overview, banner |

### Mực & bề mặt
| Token | Hex | Dùng cho |
|---|---|---|
| `--color-ink` / `--color-text` | `#1F2A44` | Tiêu đề, số lớn, line-icon (navy đậm) |
| `--color-ink-soft` | `#2A3654` | Body text |
| `--color-muted` | `#8A93A5` | Label phụ, mã TK, subtitle |
| `--color-background` | `#FBE9E3` | Nền blush của màn hình con (Tài sản/Cài đặt) |
| `--color-background-soft` | `#FDF3EF` | Nền blush nhạt hơn (fallback/scroll) |
| `--color-surface` | `#FFFFFF` | Card trắng |
| `--color-surface-tint` | `#FCEEE7` | Card peach (khối quick-actions trên Home) |
| `--color-border` | `#F0E2DB` | Đường kẻ rất nhạt trong card (divider), KHÔNG viền cứng quanh card |

### Semantic tiền (giữ, chỉ tinh chỉnh để không đụng brand)
| Token | Hex |
|---|---|
| `--color-positive` | `#16A34A` |
| `--color-negative` | `#DC2626` |
| `--color-warning` | `#D97706` |

Source-label palette (`msb/self/estimated/mock`): **giữ nguyên** — không đổi (Phase 07 chỉ chỉnh spacing/kích cỡ chip cho khớp phong cách mới).

## 2. Bo góc (radii)
| Token | px | Dùng cho |
|---|---|---|
| `--radius-card` | `24px` | Card chính (rounded-3xl) — MSB card rất tròn |
| `--radius-row` | `16px` | Row trong accordion / list item |
| `--radius-pill` | `9999px` | Bottom nav, nút CTA chính, chip |
| `--radius-sm` | `12px` | Ô nhỏ, badge |

## 3. Bóng (shadow) — mềm, khuếch tán, KHÔNG viền
- Card: `0 8px 24px -10px rgba(31,42,68,0.14)`
- Nav pill nổi: `0 10px 30px -8px rgba(31,42,68,0.22)`
- Bỏ `border` cứng quanh card (design cũ dùng `border border-border`). Divider nội bộ dùng `--color-border` 1px.

## 4. Typography — Be Vietnam Pro (next/font/google, subset `vietnamese`)
| Vai trò | Size | Weight |
|---|---|---|
| Screen title (Tài sản, Cài đặt) | 22–24px | 700 |
| Số lớn (Tổng số dư, Giá trị ròng) | 26–30px | 700 |
| Section header | 15–16px | 600 |
| Body | 14–15px | 400/500 |
| Label phụ / muted | 12–13px | 500 |

Chữ mặc định màu `--color-ink`. Không dùng Inter nữa.

## 5. Icon
- Lucide line-icon, stroke `--color-ink` (navy), điểm nhấn dùng `--color-primary`.
- Active/nav/CTA: icon cam. Kích thước lưới quick-action ~28px, nav ~22px.

## 6. Layout patterns đọc từ ảnh
- **Home**: hero gradient đỏ→cam bo góc dưới; card TK trắng đè lên hero; khối peach quick-actions (lưới 3 cột icon+label); banner khuyến mãi bo góc.
- **Tài sản/Cài đặt**: nền blush, title lớn navy, các **accordion/list card** trắng bo tròn (icon + label + chevron); Tài sản có tổng số dư + row TK + "Mở mới".
- **Bottom nav**: **pill trắng nổi** cách đáy 1 khoảng (mx + mb), bóng đậm; tab active = **pill peach** bọc icon+label cam; tab thường icon navy + label muted.
- **Header màn con**: chỉ là title lớn navy trên nền blush (không card, không status-bar giả kiểu cũ).
- Nền có **hoa văn trang trí** rất mờ (đồng xu/ornament) — optional, có thể bỏ để giữ nhẹ.

## 7. Ánh xạ token cũ → mới (đổi ở `globals.css`)
| Cũ | Mới |
|---|---|
| `--color-primary: #d81f36` | `#F26522` |
| `--color-primary-soft: #fde8ea` | `#FCE3D7` |
| `--color-background: #f4f5f7` (xám) | `#FBE9E3` (blush) |
| `--font-sans: Inter …` | Be Vietnam Pro (qua next/font var) |
| Card `rounded-lg border shadow-sm` | `rounded-[24px]` borderless + soft shadow |
