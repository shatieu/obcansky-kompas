Signal always wins. Občanský kompas speaks to a generation that scrolls fast: loud poster type, flat colour, sharp edges, one clear move per screen. If a choice looks nicer but reads slower on a phone in sunlight, it's the wrong choice.

## Principles

1. **One thing per screen.** One heading, at most one short sentence under it, one primary action, at most one secondary. Anything longer goes behind **Co to znamená?** (bottom sheet on mobile, inline on desktop). Exported PDF letters are the only long text.
2. **Poster, not form.** Headlines in `display` / `h1` (Mona Sans Expanded 800), big tabular numbers, a `night` navy plane for the hero and the signature moment. Rules are for controls; separate content with planes and space.
3. **Flat and sharp.** `radius-none` everywhere. `radius-round` is used ONLY for the profile-photo preview and the selection mark. No shadows, gradients, blur, illustrations, stock or AI imagery, emoji.
4. **The flag is sacred.** See *Vlajka* below. Always 3:2, always whole, always alone.
5. **Neutral quiz, one opinionated block.** Answers, charts and progress look identical whatever someone picks. Only **StanceBlock** ("Kde stojíme my") takes a side, on a solid `blue` plane.
6. **Thumb first.** Design at 360px, then 1280px. Targets ≥ `target-min` (48px), answers ≥ `answer-min` (56px), primary button `button-height` (60px), full-width in a **StickyBar** on mobile.
7. **No fake proof.** Sample numbers sit under **SampleBanner** ("Ukázková data"); every demo build shows **SampleBadge** ("Ukázkový režim"). No invented testimonials.

## Voice

- **Tykání** in all UI copy: "Vyber jednu možnost.", "Posuň jezdec.", "Podepiš své prohlášení", "Fotka zůstává v tvém telefonu." Short, direct, a bit of attitude, never sarcastic, never moralising.
- Fixed product strings stay as specified: "Spustit kompas", "Co to znamená?", "Napsat zástupcům", "Profilová fotka", "Zobrazit mé jméno", "Můj text", "Ukázková data".
- Letters to representatives are the exception: formal **vykání** ("Vážená paní poslankyně…").
- Buttons are verbs plus `arrow-right`. Kickers in UPPERCASE `kicker` style ("8 OTÁZEK · 5 MINUT").
- Czech typography: „uvozovky“, non-breaking spaces in "12 480", "31 %", "9,2 mld Kč"; decimal comma; en dash "18–39".

## Colour

Czech tricolour, vivid but not loud. Text meets WCAG AAA (7:1) in both themes.

| Token | Use | Never |
|---|---|---|
| `surface` | page | — |
| `night` / `on-night` | poster planes: home hero, signature confirmation, share images (same navy in both themes) | body content |
| `ink` | text, control borders, **errors** (text + icon + 4px rule) | — |
| `ink-secondary` | hints, captions, tags | body copy |
| `blue` / `on-blue` | primary button, **selected** answer, bars, stance plane | "correct" |
| `red` | ONE element per screen: slogan, one key number, the flag | answers, errors, buttons |
| `blue-tint` | explanations, chart tracks, hover, the live slider line | text |
| `muted` + hatch | disabled only | readable text |

- Red in light mode is 5.2:1 on white: red text must be ≥ 24px. The flag counts as the screen's red element; on quiz screens the red element is the current progress segment.
- Dark mode lightens `blue` (#82B6F0) and `red` (#F79A9C) and flips `on-blue` to navy.

## Typography

**Mona Sans** (GitHub, OFL), in two cuts that ship in `fonts/` with full Czech diacritics:

- **Mona Sans Expanded** 700 / 800 (`--font-wide`) for display, headlines, kickers, numbers, buttons. The wide, heavy cut is what makes it feel like a poster or a streetwear tag instead of a ministry form.
- **Mona Sans** 400 / 500 / 600 (`--font-sans`) for body, answers, inputs. It has the same skeleton at normal width, so it stays calm and readable at 17px.
- It has real `tnum` tabular figures, so counts and percentages line up.
- Why not IBM Plex (the previous pick): it reads institutional and corporate. Why not Inter: it's every SaaS dashboard.
- In Next.js: `next/font/google` → `Mona_Sans({ subsets: ['latin','latin-ext'], axes: ['wdth'], variable: '--font-mona' })`, then `font-stretch: 125%` for the wide cut. Or self-host the five files here.

Scale (mobile → desktop): `display` 38/40 → `display-desktop` 72/72; `h1` 30/32 → `h1-desktop` 48/50; `h2` 22/26; `kicker` 13/16 caps; `h3` 19/24; `body` 17/26; `body-strong` 17/24 500; `small` 15/22; `caption` 14/20 (the floor). Numbers: `stat-xl` 72, `stat-l` 44, `stat-m` 22, wide 800, tabular.

> Příliš žluťoučký kůň úpěl ďábelské ódy — ž ř č ů ě š ť ď ň Ž Ř Č Ů Ě

## Vlajka

The flag is always shown as a whole, correctly proportioned national symbol. These rules don't bend:

1. **3:2, always.** Height = width × 2/3. Use the **Flag** component (`aspect-ratio: 3/2`, viewBox 900×600); never stretch, crop or use `preserveAspectRatio="none"`. The wedge apex sits at half the length.
2. **Alone.** Nothing on top of it: no text, icons, symbols, rules, badges or callouts. Clear space around it is ≥ ¼ of its height.
3. **Outlined.** A 1px `flag-edge` outline sits outside the flag, so its rectangle reads on white and on navy (`on-night` on night planes).
4. **Official colours.** `flag-blue` #11457E, `flag-red` #D7141A, `flag-white` #FFFFFF in both themes.
5. **Minimum size** `flag-min`: 16px tall (24 × 16 in the wordmark). Inside the selection mark it is 20 × 13.3.
6. **Where it appears:** home hero, signature confirmation (**FlagUnfold**: the flag builds in 800ms, the message appears *below* it), wordmark, the selection mark, the corner frame of the profile photo, and the share images. Nowhere else.

## Selection

There are no tick marks anywhere. Any selection (single choice, multiple choice, checkbox) uses **SelectMark**: an empty 28px ring when off, a white disc holding a whole 3:2 flag when on. The ring thickens on hover. Selected answers also turn solid `blue`.

## Sliders

**BudgetSlider** never relies on static labels under the track. A callout rides on top of the handle and always says where you are: on an anchor it turns solid `blue` and names it ("NÁVRH VLÁDY", "DNES"); between anchors it says the difference to the nearest one ("DNES − 0,8 mld"). The handle snaps to an anchor within `0,15 mld`. Anchors are small clickable notches on the track, filled `blue` when you're on them. The per-adult line updates live below.

## Space, rules, layout

- 8px grid (`space-1` 8 … `space-12` 96). In Tailwind `--spacing: 8px`.
- Mobile: 16px gutter, sections padded `space-3`. Desktop 1280: 48px gutters, main column 688 + side column 448.
- Rules: `rule-hair` 1px, `rule-strong` 2px (controls), `rule-focus` 3px (focus ring, error borders), `rule-heavy` 4px (sheet top, error rule, kicker bar).
- Focus: 3px solid `focus`, 3px offset. On blue and night planes it switches to their foreground colour.

## Iconography

A custom set inside the bundle (**Icon**): 24px grid, 2px stroke, square caps, mitred joins, `currentColor`. Names: arrow-right, chevron-right/down/left, plus, minus, close, info, alert, external, download, mail, share, compare, law, refresh. There's no check icon: selection is the flag mark. Don't swap in Lucide or Heroicons, whose round caps break the system.

## Components and screens

Components live in `components/bundle.js` as `window.Kompas` (React 18 reference, source in `components/src/`). The ten screens are page cards under **Obrazovky** (mobile 360; desktop 1280 for 1, 2 and 5). For the Next.js + Tailwind build use `assets/Developer/kompas.css`: CSS variables, the Tailwind v4 `@theme` (which deletes default colours, radii and shadows), and the keyframes.
