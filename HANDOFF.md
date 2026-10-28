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

## Pro další session

- Tajné hodnoty (klíče, heslo role `kompas_app`) jsou jen v `.env.setup.local` na počítači vlastníka a ve Vercel env.
- Migrace: nový soubor v `supabase/migrations/`, aplikovat přes Supabase MCP `apply_migration`.
- Lokálně: `pnpm i && pnpm dev` (PGlite, `DEMO_MODE=1`, bez klíčů).
