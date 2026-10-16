# iPhone 17 Pro Max display reference

## Canonical implementation viewport

- **Portrait logical viewport:** `440 × 956 pt` (use `440 × 956 CSS px` for a browser reference viewport).
- **Physical panel:** `1320 × 2868 px` at **@3x** (Apple UIKit scale factor).
- **Display aspect ratio:** `956 / 440 = 2.172727… : 1` (equivalently `2868 / 1320`).
- **Device body:** 78.0 mm wide × 163.4 mm high; body ratio is `2.094872… : 1` and must not be used as the screen/canvas ratio.
- **Display diagonal:** 6.9 in nominal; Apple states 6.86 in when measured as a standard rectangle. The visible area is smaller because of rounded corners.

## Sources

1. [Apple Human Interface Guidelines — Layout](https://developer.apple.com/design/human-interface-guidelines/layout): lists **iPhone 17 Pro Max: 440×956 pt (1320×2868 px @3x)**. This is the authoritative logical-layout target.
2. [Apple — iPhone 17 Pro and 17 Pro Max Technical Specifications](https://www.apple.com/iphone-17-pro/specs/): lists **2868×1320 px at 460 ppi**, 6.9-inch display, and 6.86-inch rectangular diagonal; it also explains that rounded corners reduce the actual viewable area.
3. [Apple Support — iPhone 17 Pro Max Tech Specs](https://support.apple.com/en-sa/125091): lists physical body dimensions **78.0 × 163.4 × 8.75 mm**.

## Note

Apple’s `pt` is the native logical unit. In a web preview, CSS pixels are the appropriate equivalent for matching layout geometry; do not emulate 1320×2868 CSS pixels. Account for browser/iOS safe-area insets separately from this full-screen viewport.
