# Ano / Ne — pravidla

The hard rules, for whoever writes the code. If a pull request needs one of the "Ne" items, the design is wrong, not the rule. The **DoDont** card shows them visually.

| Ano | Ne |
|---|---|
| The flag at 3:2, whole, alone, 1px `flag-edge` outline, clear space ≥ ¼ of its height | Text, icons, symbols, callouts or rules on the flag; stretched, cropped or full-bleed flags |
| Selection = **SelectMark** (whole flag in a circle) | Tick marks ✓, checkmarks, radio dots |
| Slider position told by a callout riding on the handle | Static tick labels under the track |
| `border-radius: 0` on every element; `rounded-round` only on the profile photo and the selection mark | `rounded-*`, pill buttons, rounded inputs, rounded cards |
| Separate with flat planes (`surface`, `blue-tint`, `blue`) and 1–2px rules | `shadow-*`, `drop-shadow`, gradients, glassmorphism, `backdrop-blur` |
| Diagonal hatch for disabled (the only pattern) | Opacity-faded disabled states |
| One primary button per screen, at most one secondary text button | Two filled buttons side by side, button rows of three (the StanceBlock's own pair is the one exception) |
| Primary full-width and sticky at the bottom on mobile | Floating action buttons, primary buttons in the middle of content |
| Heading + max one short sentence; the rest behind "Co to znamená?" | Paragraphs under a heading, intro blocks, FAQ walls |
| ≥ 48px touch targets, ≥ 56px answers | Inline text links as the only way to act |
| Selected = solid `blue` + `on-blue` text + flag mark | Green for selected, red for wrong, "správně" language |
| Errors = `ink` text + alert icon + 4px `ink` rule | Red error text, red borders, shaking |
| At most ONE `red` element per screen (slogan, key number, flag) | Red buttons, red answers, red errors, red decoration |
| Charts: one colour (`blue`), labels on the bars, bars in answer order | Legends, rainbow series, sorting by size, highlighting "our" answer |
| Sample numbers inside **SampleBanner**, **SampleBadge** in the app bar | Invented counts, testimonials, quotes, logos of supporters |
| Mona Sans Expanded for headlines and numbers, Mona Sans for text, 17px body, tabular figures | System fonts shipped as the design, text under 14px, a third typeface |
| Tykání in UI copy; vykání only in letters to officials | Mixed address on one screen |
| The flag only in the places listed in the brand book | Waving or photographic flags, flag emoji, looping animation, flag stripes as decoration |
| Icons from the bundle (square caps) | Lucide/Heroicons, emoji, illustrations, stock or AI images |
| Stance only in **StanceBlock** | Opinionated copy inside questions, answers or explanations |

## Tailwind guardrails

`assets/Developer/kompas.css` resets `--color-*`, `--radius-*`, `--shadow-*`, `--drop-shadow-*`, `--inset-shadow-*` and `--blur-*` to `initial`, so the forbidden utilities do not compile. Add a lint rule to catch arbitrary values like `rounded-[8px]` or `shadow-[…]`, for example a `no-restricted-syntax` regex or `eslint-plugin-tailwindcss` with `no-arbitrary-value`.
