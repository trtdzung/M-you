# Home color probe — đo từ `ref-ui-msb/1.1` & `1.2`

> Hex xấp xỉ đọc trực tiếp từ 2 ảnh Home MSB thật. Dùng làm chuẩn cho `.hero-gradient`
> và token. Không rải hex rời rạc trong component — tất cả qua `globals.css`.

## Hero gradient (nền cam → peach, gần dọc)
| Điểm | Hex | Ghi chú |
|---|---|---|
| Đỉnh hero (trên status bar) | `#F5822C` | cam ấm, hơi sáng ở giữa-trên |
| Highlight giữa-trên | `~rgba(255,255,255,0.28)` | quầng sáng mờ (radial) |
| Giữa hero (dưới watermark) | `#F79A54` | cam nhạt dần |
| Gần account card | `#FAC49E` → `#FBE4D4` | fade sang peach/cream |
| Đáy hero (mép card) | `#FBE9E3` | trùng `--color-background` (blush) |

Hướng: **gần dọc (180°)**, KHÔNG 135°. Có quầng sáng nhẹ phía trên giữa.

## Watermark "M"
- Glass trắng mờ, `fill rgba(255,255,255,0.22)`, viền sáng `rgba(255,255,255,0.35)`, blur nhẹ.
- Nổi giữa hero, opacity tổng ≤ 0.9 nhưng fill rất trong; `aria-hidden`.

## Account card / peach card
| Bề mặt | Hex |
|---|---|
| Card trắng (account) | `#FFFFFF` (hơi ngả kem `#FFFDFB` ở ref — giữ trắng) |
| Card peach (quick-actions) | `#FCEEE7` (`--color-surface-tint`) |
| Divider trong card | `#F0E2DB` (`--color-border`) |

## Mực & nhấn
| Vai trò | Hex |
|---|---|
| Tên hạng / accent (M-FIRST GOLD, số %, arrow) | `#F26522` (`--color-primary`) |
| Số TK / label muted | `#8A93A5` (ref) → dùng `#5F6775` cho AA |
| Số dư / tiêu đề navy | `#1F2A44` (`--color-text`) |
| Chevron `›` | `#1F2A44` |

## Bottom nav
- Bar trắng `#FFFFFF`, pill active peach `#FCE3D7` (`--color-primary-soft`), icon+label cam `#F26522`.
- Tab thường: icon navy `#1F2A44`, label muted.
