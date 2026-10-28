**Živá URL:** https://obcansky-kompas.vercel.app
**Stav:** POC s databází (§16 B) – Vercel + Supabase `obcansky-kompas` (`qspjbbyoyxwrtiporjwo`, eu-central-1), `POC_MODE=1`, `DEMO_MODE=1`, ukázková data.
**Co máš udělat:** pro POC nic. Pro ostrý provoz projdi kontrolní seznam níže (§16 D).

---

## Co je hotové

| Milník | Stav | Ověřeno |
| --- | --- | --- |
| 0 Fáze 0 | hotovo | `DECISIONS.md` |
| 1 Základ | hotovo | `pnpm lint`, `typecheck`, `test`, `build` |
| 2 Obsah a kompas | hotovo | unit testy větvení a `composeStatement`; JS kompasu 147,3 kB gzip (limit 150) |
| 3 Rešerše a ověření | hotovo | 37 vysvětlivek, 167 tvrzení, všechna s verdiktem `ano` (2 kola); review nestrannosti a srozumitelnosti 37/37 |
| 4 Seed | hotovo | 500 ukázkových podpisů + 3 fiktivní subjekty, i v produkční DB |
| 5 Statistiky, srovnání, hlavní stránka | hotovo | curl 200, `/api/stats` z DB |
| 6 Virtuální nasazení | hotovo (nahrazeno §16 B) | curl |
| 7 Podpis | hotovo | curl proti produkci: podpis → POC ověření → `/v/{uuid}` 200 |
| 8 Supabase + POC | hotovo | migrace přes MCP, role `kompas_app`, schéma `app` není v Data API (REST vrací PGRST106) |
| 9 Sdílení | hotovo | OG obrázky curl 200; story/čtverec/Web Share v prohlížeči **neověřeno** |
| 10 Akce | hotovo | Playwright (agent): PDF, ZIP, mailto, datové schránky |
| 11 Můj zákon | hotovo | PDF + DOCX v prohlížeči |
| 12 Fotka | hotovo | export 1080×1080 bez EXIF; HEIC **neověřeno** |
| 13 Strany a hnutí | hotovo | `pnpm org:invite` + odeslání přes curl |
| 14 Metodika, O projektu, Soukromí, security.txt | hotovo | curl 200 |
| 15 Bezpečnost a výkon | hotovo | CSP (nonce na dynamických stránkách), HSTS, start guard, CI, Dependabot, k6 skript (**nespuštěn**); Lighthouse **nespuštěn** |
| 16 E2E | viz níže | |
| 17 Finální nasazení | viz níže | |

Designový systém vlastníka (Mona Sans, vlajková značka výběru, tykání) je aplikovaný – odchylky od SPEC §4 v `DECISIONS.md`.

## Co se nepovedlo ověřit

- k6 zátěžové cíle (§14.2) – skript je v `load/`, staging neexistuje.
- Lighthouse mobil ≥ 95.
- Reálné telefony (Web Share se souborem, HEIC, gesta ořezu fotky).
- E-mail přes Resend (POC e-maily neposílá).
- `pg_cron` + `pg_net` pro frontu e-mailů – zatím jen `after()` a denní Vercel Cron.

## Kontrolní seznam pro ostrý provoz (§16 D)

- [ ] Doména a DNS; `NEXT_PUBLIC_SITE_URL` na doménu.
- [ ] Odesílací doména (SPF, DKIM, DMARC) a Resend: `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM`, `REPORT_EMAIL_TO`.
- [ ] Turnstile klíče pro doménu (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
- [ ] Hardwarové 2FA na GitHub, Vercel, Supabase, Cloudflare, e-mail.
- [ ] Položky `TODO(owner)` a `OPEN_QUESTIONS.md` (spolek, správce údajů, věta postoje, retence, kontakt pro security.txt, adresy Sněmovny/Senátu v dopisech).
- [ ] Lidská kontrola vysvětlivek a právní kontrola modulů zákona (`legal_review: approved`).
- [ ] `pnpm poc:clear` a `pnpm seed:clear` proti produkční DB, pak `POC_MODE=0`, `DEMO_MODE=0` (start guard jinak odmítne běžet se seedem).
- [ ] Zvážit Cloudflare proxy (pak vrátit `cf-connecting-ip` do `lib/sign/http.ts`).

## Online demonstrace – moderace a bezpečnost

- **AI moderace: nastav MODERATION_API_KEY ve Vercelu a spusť pnpm moderation:recheck.** Nic dalšího není potřeba – poskytovatel je výchozí `anthropic`, model `claude-haiku-5-5` (přepsat jde `MODERATION_MODEL`, vypnout `MODERATION_PROVIDER=none`). Do té doby vlastní texty schvaluje jen skript (vulgarity, odkazy, podvržená jména, obcházení filtru). Recheck potřebuje i `NEXT_PUBLIC_SITE_URL` a `CRON_SECRET`, jinak skončí chybou (cache se nezneplatní); `--no-revalidate` jen pro lokální DB.
- **Migrace k aplikaci (Supabase MCP `apply_migration`)**: `supabase/migrations/20261028190000_demonstrace_security.sql` (`signature.owner_epoch`, `demonstrator.consent_version`, index `moderation_log`).
- Nahlášení vyžaduje Turnstile – na produkci musí být nastavené `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (při buildu) a `TURNSTILE_SECRET_KEY`, jinak nahlásit nejde.
- Strop 20 automatických skrytí za hodinu: nad ním `[demo] report auto-hide cap reached` ve Vercel logu → `pnpm demo:reported` (řádek bez „SKRYTO“ s ≥ 3 nahlášeními) a ruční `demo:hide` / `demo:ban-text`.

## Pro další session

- Tajné hodnoty (klíče, heslo role `kompas_app`) jsou jen v `.env.setup.local` na počítači vlastníka a ve Vercel env.
- Migrace: nový soubor v `supabase/migrations/`, aplikovat přes Supabase MCP `apply_migration`.
- Lokálně: `pnpm i && pnpm dev` (PGlite, `DEMO_MODE=1`, bez klíčů).

## Online demonstrace – výkon

Čísla platí pro commit `03d2435` (čistý `git worktree` HEAD, `next build` + `next start`, PGlite se seedem `pnpm seed:demonstrace --count 50000`, `DEMO_MODE=1`), měřeno 2026-10-28 testem `e2e/demonstrace/perf.spec.ts` (`E2E_PERF=1`, projekt `desktop-1280`).

**Stroj:** notebook AMD Ryzen AI 7 350, 31 GB RAM, integrovaná AMD Radeon 860M (WebGL přes ANGLE/D3D11 – headless Chromium 156 kreslil hardwarově, ne SwiftShaderem); v počítači je i RTX 5050, Chromium ji nepoužil. **Skutečný střední Android změřen nebyl.**

fps = průměr přes `requestAnimationFrame` za 5 s po 2,5 s zahřátí; p5 = 5. percentil (1 / 95. percentil délky snímku).

| Pohled (desktop 1280×800) | fps | p5 fps | nejdelší snímek | viditelných / animovaných |
| --- | --- | --- | --- | --- |
| zepředu zblízka (animace + text cedulí) | 60 | 59,5 | 17 ms | 119 / 119 |
| středně (animace bez textu) | 48,4 | 29,9 | 34 ms | 1 920 / 1 500 |
| daleko (statické siluety) | 60 | 59,5 | 17 ms | 14 117 / 0 |
| celý dav (tečky) | 60 | 59,5 | 17 ms | 50 000 / 0 |

Hrubý odhad mobilu (NE skutečné zařízení): 360×780, DPR 2, dotyk, CPU 4× zpomalené přes CDP, stejná GPU – 60 / 50,1 (p5 29,9) / 60 / 60 fps; střední pohled má 300 animovaných z 452 viditelných.

**JS (gzip -9 všech stažených skriptů, včetně líných chunků PixiJS a enginu):**

| Stránka | JS | Rozpočet 250 kB |
| --- | --- | --- |
| `/demonstrace` (dav načtený) | 247,3 kB | ano (rezerva 2,7 kB) |
| `/demonstrace` + otevřená karta | 255,7 kB | **ne** (+5,7 kB) |
| `/demonstrace/[id]` (karta při načtení) | 255,7 kB | **ne** (+5,7 kB) |

Největší chunky: 65,5 kB, 62,4 kB, 59,7 kB, 21 kB, 16,2 kB (obsah chunků nerozebrán); otevření karty přidává ~8,4 kB.

Spuštění: `PGLITE_PORT=54487 PGLITE_DATA_DIR=.pglite/e2e-perf pnpm seed:demonstrace --count 50000`, pak `E2E_PERF=1 E2E_PORT=3487 E2E_PGLITE_PORT=54487 E2E_PGLITE_DATA_DIR=.pglite/e2e-perf E2E_DIST_DIR=.next-e2e-perf pnpm exec playwright test e2e/demonstrace/perf.spec.ts --project desktop-1280`.
