# Akceptační testy – Občanský kompas

Definice hotového odvozená ze `SPEC.md` (ne z aktuálního kódu). Píšou se souběžně s vývojem:
část testů teď padá nebo je `skip`/`todo`, po dokončení celé specifikace musí projít všechny.

- **Vitest** (`tests/acceptance/**/*.test.ts`) – čistá logika a chování serveru nad PGlite.
  Spuštění: `pnpm vitest run tests/acceptance` (předtím `pnpm content:build`).
- **Playwright** (`e2e/acceptance/**/*.spec.ts`) – oba projekty `mobile-360` (360×780) a `desktop-1280` (1280×800).
  Spuštění: `pnpm exec playwright test e2e/acceptance --project=mobile-360` (a `--project=desktop-1280`).
  Proti jinému serveru: `E2E_BASE_URL=http://localhost:3456`.

Přepínače e2e: `E2E_DEMO_MODE=0` (server bez DEMO_MODE – vypne test pruhu „Ukázková data“),
`E2E_STATIC_DEMO=1` (server se `STATIC_DEMO=1` – zapne test vypnutého podpisu),
`E2E_SIGNATURE_UUID` (UUID existujícího ověřeného podpisu; jinak první ověřený podpis ze seedu).

Odchylky od SPEC §4 podle designového systému vlastníka (`docs/design-system/project/`):
font Mona Sans (netestuje se název fontu, jen self-host), kruhová výjimka z `border-radius: 0` platí
i pro značku výběru (test toleruje jen plné kruhy), delší pohyby 240/500/800 ms (test: nic nad 800 ms),
tykání v textech (texty se čtou z `content/*.yaml`, nic natvrdo).

## Adaptér API podpisu

SPEC neurčuje cesty route handlerů ani názvy polí. Jediné místo, které je odhaduje, je
`tests/acceptance/helpers/signature-api.ts` (kandidáti `app/api/sign|signature|podpis/route.ts`,
`verify`, `edit-link`, `withdraw`, `event`; tělo podle §7.1). Dokud route neexistuje, testy jsou
`describe.skipIf` + `it.todo` s důvodem. Až API vznikne a zvolí jiné názvy, upraví se jen adaptér.
POC ověřovací token se hledá v odpovědi jako odkaz `/overeni/<token>` (§0.3).

## Traceability

Stav: **P** = prochází teď (2026-10-28; API podpisu `app/api/sign`, `sign/verify`, `edit-link`, `withdraw`, `event` adaptér našel), **F** = padá teď (chybí funkce), **S** = přeskočeno/todo (chybí route/funkce), **E** = e2e, stav viz poslední běh v závěru.

| SPEC | Soubor | Testy | Stav |
| --- | --- | --- | --- |
| §3 struktura content/ | content-limits.test.ts | „§3 struktura obsahu“ | P |
| §4.1 limity (otázka, volba, nadpis, text pod nadpisem, tlačítko, vysvětlivka) | content-limits.test.ts | „§4.1 limity textu – …“ (každá položka zvlášť) | P |
| §4.1 vynucení `pnpm lint:content` (build selže) | content-limits.test.ts | „§4.1 vynucení“ (4 rozbité varianty obsahu) | P |
| §5.1 otázky a volby doslova, Q1 posuvník a kotvy jako fakta | content-limits.test.ts | „§5.1 otázky a volby“ | P |
| §5.3 demografie | content-limits.test.ts | „demografie…“ | P |
| §5.2 tabulka větvení (všechny řádky) | branching.test.ts | „§5.2 tabulka větvení“ | P |
| §5.2 všechny kombinace Q2 × volba | branching.test.ts | „§5.2 všechny kombinace“ (~200 případů) | P |
| §5.2 změna dřívější volby ruší pozdější | branching.test.ts, e2e compass.spec.ts | „§5.2 změna…“, „změna dřívější volby…“ | P / E |
| §6 composeStatement deterministické, struktura, Nevím, skrytí, content_version | compose-statement.test.ts | „§6 skládání textu“ | P |
| §6 Q1 pásma + částka | compose-statement.test.ts | „§6 Q1 – pásma a částka“ | P |
| §6 čistá funkce klient/server | compose-statement.test.ts | „lib/compose nepoužívá node:…“ | P |
| §8 % lidí se stejnou odpovědí, Q1 pásmo | comparison.test.ts | „§8 srovnání“ | P |
| §8 shoda se stranami (Nevím, zašedlé, Q1 pásmo, abecedně česky) | comparison.test.ts | „§8 shoda se stranami a hnutími“ | P |
| §8 otevřená data, sloučení < 10 | comparison.test.ts | „§8 otevřená data“, „GET /api/open-data“ | P |
| §8 upozornění pod grafem, CSV ke stažení | e2e routes.spec.ts | „§8 statistiky“ | E |
| §9.2 dopisy: 3–5 variant, ≥ 100 kombinací/typ, determinismus, fakta, patička | letters.test.ts | celý soubor | P |
| §9.2 PDF, ZIP, mailto, seed+posuvníky v URL, jen `letter_prepared` | e2e exports.spec.ts | „§9.2 /akce“ | E |
| §9.3 fotka: neopustí prohlížeč, 1080×1080 PNG+JPG, varianty, slogany, `frame_downloaded` | e2e exports.spec.ts | „§9.3 /fotka“ | E |
| §9.2/§9.3 anonymní události na serveru | signature-api.test.ts | „§9.2 / §9.3 anonymní události“ || P |
| §9.4 OG 1200×630, story/čtverec, `?s=` | e2e exports.spec.ts | „§9.4 sdílení“ | E |
| §10 moduly, Nevím, číslování, štítek pracovní verze, upozornění, hlavička | law.test.ts | celý soubor | P |
| §10 PDF + DOCX | e2e exports.spec.ts | „§10 Můj zákon“ | E |
| §11.3 verify:content selže při změně tvrzení po ověření | content-gates.test.ts | „§11.3 verify:content“ | P |
| §11.3 neověřená vysvětlivka se nezobrazí | content-gates.test.ts | „§11.3 vysvětlivka bez kompletního ověření…“ | P |
| §11.1/§11.3 formát záznamů, `human_reviewed`, max. 2 kola | content-gates.test.ts | „§11.1 / §11.3 formát záznamů“ | P |
| §14.1 schéma app, pole, RLS bez politik, enum, unique HMAC | schema.test.ts | celý soubor | P |
| §7.2/§7.3 neověřené se nepočítají, odvolané zůstanou v agregacích | stats-and-flags.test.ts | „§7 / §14.3 co se počítá“ | P |
| §14.3 seed jen s DEMO_MODE | stats-and-flags.test.ts | „s DEMO_MODE…“, „getStats() řídí DEMO_MODE“ | P |
| §14.3 produkční start odmítne seed bez DEMO_MODE | stats-and-flags.test.ts | „§14.3 produkční start…“ | S (čeká `instrumentation.ts` nebo `scripts/start-guard.ts`) |
| §14.2 `/api/stats` Cache-Control | stats-and-flags.test.ts, e2e routes.spec.ts | „§14.2 GET /api/stats“ | P / E |
| §16 A STATIC_DEMO statistiky ze snímku | stats-and-flags.test.ts | „STATIC_DEMO=1: statistiky…“ | P |
| §0.3 `pnpm poc:clear`, §15 `pnpm seed:clear`, seed 500 / example.invalid | stats-and-flags.test.ts | „§0.3 pnpm poc:clear…“, „§15 m4 seed“ | P |
| §7.1 povinná pole, souhlas čl. 9, komentář ≤ 500 | signature-api.test.ts | „§7.1 / §7.2 podpis“ || P |
| §0.3 POC odkaz na ověření v odpovědi, `is_poc` | signature-api.test.ts | „platný podpis…“, „§0.3 POC…“ || P |
| §7.2 stejná odpověď, jeden aktivní podpis + historie | signature-api.test.ts | „§7.2 jeden e-mail…“ || P |
| §7.2 ověření, jednorázový token, 7 dní | signature-api.test.ts | „§7.2 ověření“, „ověřovací odkaz platí 7 dní“ || P |
| §7.3 odvolání smaže osobní údaje, agregace zůstane | signature-api.test.ts | „§7.3 odvolání“ || P |
| §14.3 šifrování PII, tokeny jen SHA-256, logy bez PII, IP jen HMAC | signature-api.test.ts | „§14.3 šifrování a tokeny“, „IP se ukládá jen jako HMAC“ || P |
| §14.3 rate limity 5/h IP, 3/h e-mail, odkaz pro úpravu 3/h | signature-api.test.ts | „§14.3 rate limity…“, „§7.3 / §14.3 žádost o odkaz…“ || P |
| §14.3 jednorázové domény (statický seznam) | signature-api.test.ts | „jednorázové e-mailové domény…“ || P |
| §14.2 READ_ONLY=1, §16 A STATIC_DEMO podpis vypnutý | signature-api.test.ts, e2e routes.spec.ts | „§14.2 READ_ONLY=1 a §16 A…“ || P |
| §15 m16 celá cesta (oba viewporty) | e2e journey.spec.ts | „§15 m16…“ | E |
| §13 všechny stránky 200, `/org/[neplatný]` 404, `/v/*` noindex, security.txt | e2e routes.spec.ts | „§13 stránky“ | E |
| §0.3/§14.3 pruh „Ukázková data“ | e2e routes.spec.ts | „§14.3 pruh…“ | E |
| §5 mobil 1 otázka/obrazovka, zašedlé volby, předvyplnění, localStorage, bez serveru, živý náhled, vysvětlivky, Q1 posuvník | e2e compass.spec.ts | celý soubor | E |
| §1/§9.1 blok „Kde stojíme my“ pod kompasem a na /v/[uuid], postoj mimo kompas | e2e compass.spec.ts, design.spec.ts | „blok…“ | E |
| §14.3 CSP s nonce, HSTS, nosniff, Referrer-Policy, Permissions-Policy | e2e security.spec.ts | „§14.3 hlavičky“ | E |
| §14.3 žádné externí skripty kromě Turnstile/Plausible, self-host font | e2e security.spec.ts | „§14.3 žádné externí skripty…“ | E |
| §4.3 radius 0 (kromě kruhů), bez stínů/přechodů, pohyb, reduced-motion, 48 px, emoji | e2e design.spec.ts | „§4.3 …“ | E |
| §4.4 volba 56 px / 2 px, sticky akce, nadpis 32–40 px, tabular-nums, inverzní blok | e2e design.spec.ts | „§4.4 komponenty“ | E |

## Nelze ověřit automaticky (ruční kontrola)

| SPEC | Požadavek | Jak ověřit |
| --- | --- | --- |
| §15 m15 | Lighthouse mobil ≥ 95 výkon a přístupnost | `npx lighthouse <URL> --preset=perf --form-factor=mobile` proti produkci; ručně na `/`, `/kompas`, `/v/[uuid]` |
| §4.6 | JS kompasu ≤ 150 kB gzip, Slow 3G | `next build` výpis velikostí route `/kompas` + Playwright s CDP throttlingem (ručně) |
| §14.2 | k6 cíle (50 000 návštěv/10 min, 200/s podpisů, p95 < 300 ms, statistiky ≤ 60 s) | `k6 run load/*.js` proti stagingu, ne v CI |
| §4.2 | kontrast AAA textu / AA ovládání, tmavý režim 7:1 | axe / Lighthouse a ruční kontrola v obou režimech |
| §4.5 | vlajka < 5 kB, časování animací (400–600 ms, ≤ 800 ms) | velikost SVG v buildu, vizuálně |
| §11.2 | rešerše a ověřování nezávislými agenty, nestrannost, srozumitelnost | revize `content/verification/**` a `/metodika/zdroje` člověkem |
| §14.1 | schéma `app` není vystavené v Supabase Data API; aplikační role s minimálními právy | REST dotaz na `/rest/v1/signature` musí selhat; `\dp app.*` na produkci |
| §14.2 | degradace při nedostupné DB (stale cache, „zkuste to za chvíli“) | ručně: zastavit DB, ověřit `/statistiky` a podpis |
| §14.2 | `pg_cron` + `pg_net`, Vercel Cron, `CRON_SECRET` na `/api/cron/email` | ručně proti Supabase; částečně jde doplnit unit testem, až route vznikne |
| §14.3 | Dependabot, `pnpm audit` v CI, retence IP max. 7 dní | konfigurace repa / CI, plánovaný úklid `rate_limit` |
| §14.4 | `/soukromi` obsah, `docs/dpia.md` | ruční revize textu (TODO(owner)) |
| §9.3 | EXIF otočení, HEIC fallback, odstranění metadat, gesta | ruční test s fotkami z telefonu (HEIC, EXIF orientace 6/8) |
| §9.4 | Web Share API se souborem na mobilu | ručně na skutečném telefonu |
| §12 | `pnpm org:invite`, `/org/{token}` uzamčení po odeslání | zatím jen 404 pro neplatný token; po implementaci doplnit test skriptu |
| §16, §18 | nasazení, HANDOFF.md, GitHub repozitář | ruční / curl smoke test |
