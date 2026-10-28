# DECISIONS

## Fáze 0 (2026-10-28, odpovědi vlastníka)

| # | Otázka | Rozhodnutí |
| --- | --- | --- |
| 1 | Založení Supabase projektu `obcansky-kompas` v org sharpSoft (Pro plán, placený compute) | **Schváleno**, region `eu-central-1`. Postupuje se podle §16 B. |
| 2 | Vercel Deployment Protection (SSO) na `*.vercel.app` | **Vypnout** – POC má být veřejně dostupné. |
| 3 | Ověřování obsahu (§11) vs. limit max. 5 souběžných subagentů | **Dávkoví ověřovatelé**: max. 5 agentů najednou; každý ověřovací agent dostane dávku tvrzení, která sám nepsal, bez kontextu rešerše (jen `claim`, `source_url`, `locator`). Odchylka od „jeden agent na tvrzení“ je přiznaná na `/metodika`. |
| 4 | Oprávnění pro samostatný běh, veřejný repozitář | **Schváleno**: `.claude/settings.local.json`, veřejný repozitář `shatieu/obcansky-kompas` (AGPL-3.0), push po každém milníku. |

Přístupy (ověřeno tiše): Supabase MCP (org sharpSoft, jediná), Vercel MCP + CLI (tým SharpSoft, jediný), `gh` přihlášené jako `shatieu`, Node 24, pnpm 11, git 2.53. Supabase CLI není přihlášené – vše přes MCP.

## Rozhodnutí session

- Supabase projekt `obcansky-kompas` založen 2026-10-28, ref `qspjbbyoyxwrtiporjwo`, `eu-central-1`. Vlastní klíče a heslo aplikační role `kompas_app` jsou v `.env.setup.local` (gitignore).
- Lead session deleguje práci na subagenty (max. 5 souběžně), sama koordinuje, nasazuje a integruje.

### Základ, obsah a kompas, seed, statistiky (milníky 1, 2, 4, 5)

- **`pnpm verify:content` v POC nezastaví build.** Skript vypíše stav každé vysvětlivky a skončí nenulově jen při strukturální chybě (neplatný YAML/JSON, záznam bez povinných polí, nesedící `claim_id`) nebo když se tvrzení změnilo po ověření (`claim_hash` nesedí). Neúplně ověřené vysvětlivky se zobrazí jako „Vysvětlivka se připravuje“ (`content-build` pustí do aplikace jen plně ověřené). Plná brána ze SPEC §11.3 je `pnpm verify:content --strict`. Ověřeno = každé tvrzení má poslední verdikt `ano` se sedícím `claim_hash` (sha256 textu tvrzení) a existuje `content/verification/reviews/<id>.json` s `impartiality: ano` a `clarity: ano`.
- **`lint:content`**: limity z §4.1 (otázky, volby, nadpisy, texty pod nadpisem, tlačítka, vysvětlivky, citace) build zastaví. Zakázané výrazy z `plain-language.yaml` zastaví build u vlastních textů webu (ui, věty, postoj); u vysvětlivek a u textů doslova předepsaných SPEC (otázky a volby z §5.1, otázka na hlavní stránce z §13) jsou jen varování – u vysvětlivek je hlídá review srozumitelnosti (§11.2/5). Konvence klíčů v `ui.yaml`: `title`/`*_title` = nadpis, `lead`/`*_lead` = text pod nadpisem, `*_button` = tlačítko.
- **Obsah do aplikace jde přes `content/generated/*.json`** (vytváří `scripts/content-build.ts` před dev/build/test/typecheck, zod validace + křížové kontroly). Soubory jsou v `.gitignore` kromě `stats-snapshot.json`. Klient dostává z faktů jen `fact-values.json` (id + hodnota).
- **Větvení**: ukládají se jen uživatelovy volby, předvyplněné odpovědi (jediná povolená volba) se dopočítají. Celé zašedlé otázky navigace přeskakuje (v průběhu jsou šrafované, na obrazovce otázky je štítek a odkaz na změnu volby), aby u „Jen dobrovolné příspěvky“ nebylo šest mrtvých obrazovek. Q2 = 3/4/5: Q5–Q7 zašednou celé, Q4 jen „Nikdo zvlášť“ (předvyplněno), Q8 jen „Ne“ (předvyplněno). Q7: „Platí všichni“ a „Nevím“ vylučují ostatní volby.
- **Q1**: výchozí poloha posuvníku = střed rozsahu (8,5 mld), aby nezvýhodňovala žádnou kotvu; odpověď se uloží až po pohybu posuvníkem/tlačítky. Kotvy a pásma z `facts.yaml` (`gov-proposal-total-bn`, `today-total-bn`, „Dnes +10 %“ = today × 1,1). Shoda s kotvou = rozdíl pod 0,05 mld. Přepočet na dospělého se ukáže, až bude mít `adults-count` hodnotu.
- **Do podpisu a statistik se ukládají efektivní odpovědi** (vč. předvyplněných). `content_version` = `version` ze `sentences.yaml`; staré verze se pro rekonstrukci registrují v `lib/compose` (`registerContent`).
- **Statistiky**: „Top 10 kombinací“ = kombinace odpovědí Q2 + Q3 + Q4 (stejné „3 klíčové volby“ jako sdílecí obrázek). Odvolané podpisy zůstávají anonymně v agregacích (§7.3). Seed se počítá jen s `DEMO_MODE=1`. Pro `STATIC_DEMO=1` stejná agregace v TS nad snímkem seedu; test hlídá, že SQL a TS dávají stejný výsledek.
- **Otevřená data** `GET /api/open-data`: CSV po otázkách, kategorie pod 10 lidí sloučené do „Ostatní (méně než 10)“; když je i sloučený součet pod 10, počet se nezveřejní.
- **Stav kompasu v prohlížeči**: `localStorage` klíč `obcansky-kompas:v1` (`lib/compass-storage.ts`: `answers`, `demographics`, `invalidated`, `hideUnknown`). Krok kompasu je v `#hash` (`#q1`…`#q8`, `#o-vas`, `#text`).
- **Build a dev přes webpack** (`next build --webpack`, `next dev --webpack`): na tomto počítači blokuje Application Control nativní SWC binárku, Turbopack bez ní neběží. Na Vercelu by šel i Turbopack.
- **JS kompasu**: vysvětlivky se načítají líně (samostatný chunk při prvním otevření) a na cestě kompasu se místo `next/link` používá `<a>`, aby JS zůstal pod 150 kB gzip (`pnpm measure:js http://localhost:3000/kompas` proti `next start`).
- **Dev DB**: bez `DATABASE_URL` spustí `pnpm dev` PGlite (`.pglite/dev`) jako Postgres server přes pglite-socket na `127.0.0.1:54329`, aplikuje `supabase/migrations/*.sql`, při prázdné DB nahraje seed a zapne `DEMO_MODE=1` a `POC_MODE=1`. Klíče pro šifrování mají mimo produkci vývojovou náhradu.
- **TypeScript 6.0.3** (ne 7.x – nativní port zatím nemá JS API, které používá Next), **ESLint 9** (pluginy `eslint-config-next` zatím nejsou ověřené s ESLint 10).
