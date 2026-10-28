# Pohyb a vlajka

Motion runs **once**, never loops, never waves. Under `prefers-reduced-motion: reduce` every animation jumps to its end state. The flag is always 3:2 and nothing ever moves across it.

| Token | Value | Where |
|---|---|---|
| `duration-instant` | 100ms | colour change, callout movement |
| `duration-fast` | 160ms | scrim, toggle, selection mark pop, callout snap |
| `duration-base` | 240ms | bottom sheet |
| `duration-flag` | 500ms | home flag |
| `duration-unfold` | 800ms | signature confirmation, total |
| `easing-out` | cubic-bezier(0.2, 0, 0, 1) | everything that arrives |
| `easing-in` | cubic-bezier(0.4, 0, 1, 1) | sheet closing |

## Flag geometry

`<svg viewBox="0 0 900 600" style="aspect-ratio:3/2; outline:1px solid var(--flag-edge)">`: white `0,0 900×300`, red `0,300 900×300`, wedge `M0 0 L450 300 L0 600 Z`. The SVG clips its own content, so animated parts never leave the 3:2 frame.

## 1 · Home flag — 500ms, once

```css
.f-blue  { transform-box: view-box; transform-origin: 0 0; animation: wedge-in 500ms cubic-bezier(.2,0,0,1) both; }
.f-white, .f-red { transform-box: view-box; transform-origin: 0 0; animation: stripe-in 500ms cubic-bezier(.2,0,0,1) 60ms both; }
@keyframes wedge-in  { from { transform: translateX(-100%) } to { transform: none } }
@keyframes stripe-in { from { transform: scaleX(0) }        to { transform: scaleX(1) } }
```

## 2 · Signature confirmation — 800ms

A `night` full-screen plane (`role="status"`). The flag sits in the upper half at full width minus gutters (max 480px), at exactly 3:2. The message sits **below** the flag, never over it.

| t | frame |
|---|---|
| 0ms | night plane + the flag's empty 1px outline |
| 0–300ms | wedge grows from the left edge (`scaleX 0→1`, origin 0 0) |
| 150–650ms | white and red stripes draw left→right |
| 600–800ms | "Podepsáno." (`display`) and one line rise 8px and fade in under the flag |
| 800ms+ | still; continue to the result page on tap or after 1.5s |

```css
.k-flag--unfold .f-blue { transform-origin: 0 0; animation: stripe-in 300ms cubic-bezier(.2,0,0,1) both; }
.k-flag--unfold .f-white, .k-flag--unfold .f-red { transform-origin: 0 0; animation: stripe-in 500ms cubic-bezier(.2,0,0,1) 150ms both; }
.k-unfold__msg { animation: rise 200ms cubic-bezier(.2,0,0,1) 600ms both; }
@keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
```

## 3 · Slider callout

The callout's `left` follows the handle (`calc(14px + (100% - 28px) * p)`), and `translateX(-p%)` keeps it inside the track at both ends while its tip stays on the handle. When the value snaps to an anchor, the box turns `blue` and pops (`scale .4 → 1`, 160ms). Between anchors it's an outlined box with the difference.

## 4 · Selection mark

On select, the white disc with the flag pops in (`scale .4 → 1`, 160ms `easing-out`).

## 5 · Bottom sheet — 240ms

Scrim fades 160ms; the sheet slides `translateY(100%) → 0` over 240ms. Focus moves to the sheet title, and back to the "Co to znamená?" row on close.

## 6 · Photo frames and share images

Static. Exported files.
