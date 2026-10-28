# SPEC – Občanský kompas: financování médií veřejné služby

Zadání pro implementační session. Tento soubor je jediný zdroj pravdy. Designový podklad (zdůvodnění, rešerše) je v dokumentu „Spec – Občanský kompas“ – při rozporu platí tento soubor.

Název projektu: **Občanský kompas**. Repozitář, Vercel projekt i Supabase projekt: `obcansky-kompas`. Doména zatím otevřená (§17).

---

## 0. Režim práce

Jedna **lokální** session na počítači vlastníka. Má k dispozici **MCP pro Supabase, MCP pro Vercel a git** (vč. přístupu na GitHub). Začíná krátkou Fází 0, kdy je vlastník u počítače, pak pracuje **sama** až do živého POC na Vercelu. Těžiště je kód.

Cíl: když se vlastník vrátí, POC běží na Vercelu, nebo zbývá nejvýš jeden krok popsaný v `HANDOFF.md`.

### 0.1 Fáze 0 – s vlastníkem (co nejkratší)

Vlastníka zatěžuj jen tím, co bez něj nejde. Přístupy si ověř sama a ptej se jen, když něco chybí.

1. **Tichá kontrola přístupů (bez otázek).**
   - Supabase MCP: vypiš organizace a projekty. Ověř, že umíš projekt založit a získat connection string včetně hesla (MCP, případně Supabase CLI).
   - Vercel MCP: vypiš týmy a projekty. Ověř, čím umíš nasadit a nastavit env proměnné (MCP, případně Vercel CLI, pokud je přihlášené).
   - GitHub: `gh auth status` nebo jiný dostupný přístup. Ověř, že umíš založit repozitář pod účtem `shatieu`.
   - Nástroje: Node LTS, pnpm, git. Chybějící doinstaluj.
2. **Jedna sada otázek.** Polož najednou:
   - nejasnosti ve specu (max. 8, každá s doporučenou výchozí volbou),
   - výběr organizace / týmu, pokud jich je víc,
   - **schválení nákladů a založení Supabase projektu** (přes potvrzení nákladů v Supabase MCP). Bez schválení projekt nezakládej a postupuj podle §16 C,
   - jen pokud kontrola v bodě 1 něco neprošla: chybějící přístup (např. token pro CLI).
   Odpovědi zapiš do `DECISIONS.md`.
3. **Oprávnění pro samostatný běh.** Navrhni `.claude/settings.local.json` s povolenými příkazy a nástroji (pnpm, npx, node, git, gh, curl, MCP nástroje Supabase a Vercel, zápis v repozitáři). Nech vlastníka potvrdit. Bez toho by se session zasekla na první žádosti o povolení.
4. **Start.** Jednou větou shrň plán a oznam, že teď pracuješ sama. Další otázky už nepokládej. Nejasnosti rozhodni sama a zapiš do `DECISIONS.md`.

Hned po Fázi 0 založ veřejný GitHub repozitář `shatieu/obcansky-kompas` (popis „Občanský kompas – financování médií veřejné služby“, licence AGPL-3.0), první commit se `SPEC.md` a push. Dál pushuj po každém milníku.

### 0.2 Pravidla samostatné práce

- **Žádný prohlížeč.** Žádné procházení ani klikání na webech Supabase, Vercelu, GitHubu ani jinde. Jen MCP, CLI a git.
- Nedělej nic, co vyžaduje vlastníka (platby, DNS, ověření domény, nové účty). Zapiš to do `HANDOFF.md` a pokračuj jinde.
- Nic nevymýšlej. Každé číslo a fakt v obsahu musí mít zdroj ověřený podle §11.
- Kde chybí rozhodnutí vlastníka, použij `TODO(owner): …` a zapiš do `OPEN_QUESTIONS.md`.
- Po každém milníku z §15 commit a zelené testy.
- Když se něco zablokuje (chyba CLI, limit, výpadek), zkus jednu rozumnou alternativu. Když nepomůže, zapiš do `HANDOFF.md` a pokračuj dalším milníkem.
- Priorita je kód. Rešerše vysvětlivek (§11) běží souběžně na pozadí a nikdy neblokuje vývoj ani nasazení.

### 0.3 POC režim (`POC_MODE=1`)

Aby šlo POC ukázat bez domény a bez e-mailové infrastruktury:

- Ověření podpisu je simulované. Místo e-mailu se ověřovací odkaz ukáže přímo na obrazovce s jasným štítkem „Ukázkový režim“. Žádný e-mail se neposílá.
- Turnstile používá oficiální testovací klíče.
- Seed (§15, milník 6) je vidět, na stránkách se statistikami je pruh „Ukázková data“.
- Podpisy z POC mají `is_poc = true`. Před ostrým spuštěním je smaže `pnpm poc:clear` a `POC_MODE=0`.
- Běží na doméně `*.vercel.app`.

---

## 1. Účel

Web, kde člověk v kompasu odpoví na 8 otázek o financování ČT a ČRo. Z odpovědí se složí text, který podepíše. Výsledky se zveřejňují jako statistiky. Vedle toho stojí jasně oddělený blok postoje spolku s akcemi (dopisy zástupcům, profilová fotka).

**Hierarchie:**

1. Kompas je průzkum. Otázky, odpovědi a vysvětlivky jsou nestranné, včetně možnosti „Návrh vlády“.
2. Hned pod kompasem je jasně oddělený blok „Kde stojíme my“: spolek nesouhlasí s vládním návrhem + tlačítka Napsat zástupcům a Profilová fotka. Vidí ho všichni.
3. Postoj se nikdy nepropíše do kompasu, vysvětlivek ani statistik.

Jazyk: pouze čeština. Cílová skupina: celá populace. Psát lidsky, bez odborných pojmů (§11.4).

---

## 2. Stack

| Oblast | Volba |
| --- | --- |
| Framework | Next.js (App Router, aktuální stabilní), TypeScript strict |
| Styl | Tailwind CSS v4, design tokeny v CSS proměnných |
| Font | Inter Tight přes `next/font` (self-host, latin-ext) |
| Ikony | lucide-react (jen funkční ikony) |
| DB | Postgres na Supabase, přístup přímo přes driver `postgres` (porsager) přes pooler. **Nepoužívat** Supabase Auth ani Data API |
| ORM / migrace | Drizzle ORM, migrace generované do `supabase/migrations/*.sql` (kompatibilní se `supabase db push`) |
| Dev a test DB | PGlite + `@electric-sql/pglite-socket` (stejný driver jako v produkci). Fallback: lokální Postgres, pokud je k dispozici |
| Validace | zod (vstupy API i schémata obsahu) |
| E-mail | adaptér: `console` (dev), `resend` (prod, přes env). Rozhraní tak, aby šel přidat jiný poskytovatel |
| Ochrana formulářů | Cloudflare Turnstile (v dev testovací klíče) |
| PDF | pdf-lib v prohlížeči, embed fontu s češtinou |
| DOCX | knihovna `docx` v prohlížeči |
| OG obrázky | `next/og` na serveru, font s češtinou |
| Story / čtverec / fotka | canvas v prohlížeči |
| Analytika | Plausible přes env (volitelné), jinak nic |
| Testy | Vitest (unit, DB přes PGlite), Playwright (e2e: 360×780 a 1280×800) |
| Zátěž | k6 skript v `load/` (nespouštět v CI) |
| Balíčky | pnpm |
| Hosting | Vercel, region funkcí `fra1` |
| Licence | AGPL-3.0 |

---

## 3. Struktura repozitáře

```
app/                      # stránky a route handlery
components/               # UI komponenty
lib/                      # db, crypto, email, turnstile, rate-limit, compose (skládání textů)
content/
  questions.yaml          # otázky, krátké volby, pravidla větvení
  explainers/*.yaml       # vysvětlivky + tvrzení + zdroje
  sentences.yaml          # věty k podpisu
  letters/*.yaml          # varianty dopisů
  law/*.yaml              # základ zákona, moduly, matice kompatibility
  share.yaml              # texty sdílení
  slogans.yaml            # slogany pro fotky
  ui.yaml                 # všechny texty UI
  stance.yaml             # text postoje spolku (TODO(owner))
  verification/*.json     # záznamy ověření zdrojů (§11)
data/directories/         # vygenerované adresáře (poslanci, senátoři, obce…)
scripts/                  # import, seed, ověření obsahu, setup
supabase/migrations/      # SQL migrace
load/                     # k6
HANDOFF.md                # stav, živá URL, minimum kroků pro vlastníka
DECISIONS.md              # odpovědi z Fáze 0 a rozhodnutí session
OPEN_QUESTIONS.md         # rozhodnutí, která čekají na vlastníka
```

Veškerý obsah (texty UI, otázky, věty, vysvětlivky) je v `content/`, nikdy natvrdo v komponentách. Validuje se zod schématem při buildu.

---

## 4. Design

Signál vždy vyhrává. Ostře řezaný, kontrastní, typografický design. Na obrazovce nikdy není blok textu. Vše delší je za rozbalovacím prvkem. Výjimkou jsou jen exporty (PDF, DOCX).

### 4.1 Limity textu (vynucuje `pnpm lint:content`, build při porušení selže)

| Prvek | Limit |
| --- | --- |
| Otázka | max. 8 slov |
| Volba odpovědi | max. 6 slov, max. 40 znaků |
| Nadpis obrazovky | max. 8 slov |
| Text pod nadpisem | max. 1 věta, 120 znaků |
| Vysvětlivka | max. 4 věty, každá max. 20 slov, + odkazy na zdroje |
| Tlačítko | max. 3 slova |

### 4.2 Barvy (trikolóra)

| Token | Hodnota | Použití |
| --- | --- | --- |
| `--surface` | `#FFFFFF` | pozadí |
| `--ink` | `#0B1B33` | text |
| `--blue` | `#11457E` | primární akce, vybraná volba, odkazy, grafy |
| `--red` | `#D7141A` | jediný akcent: slogany, klíčové číslo, sdílecí obrázky. Max. 1 prvek na obrazovce. Nikdy u odpovědí ani chyb |
| `--blue-tint` | `#E8EEF6` | rozbalené vysvětlivky, statistiky |
| `--muted` | `#5C6675` | zašedlé volby, sekundární text |

Tmavý režim podle systému: `--surface #0B1B33`, text bílý, modrá a červená zesvětlené tak, aby text měl kontrast min. 7:1. Chyby: text + ikona + linka v `--ink`, ne červená.

### 4.3 Vizuální pravidla

- `border-radius: 0` všude. Výjimka jen kruhový náhled profilové fotky.
- Žádné stíny, přechody, glassmorphism, ilustrace, stock fotky, AI obrázky, emoji.
- Oddělení plochami a linkami 1–2 px.
- Typografie: nadpis 32–40 px na mobilu, text 17 px, `font-variant-numeric: tabular-nums` ve statistikách.
- Pohyb: přechody do 150 ms. Výjimka: animace vlajky (§4.5). Vždy respektovat `prefers-reduced-motion`.
- Kontrast textu WCAG AAA, ovládacích prvků min. AA. Dotykové plochy min. 48×48 px.
- Žádné smyšlené počty, citace ani „sociální důkaz“.

### 4.4 Komponenty

- **Volba**: blok přes celou šířku, linka 2 px, min. výška 56 px. Vybraná = plná `--blue`, bílý text.
- **Zašedlá volba**: ztlumená + šrafa, štítek „Nejde s: …“. Klepnutí otevře vysvětlení, ne výběr.
- **Vysvětlivka**: řádek „Co to znamená?“ pod volbou nebo otázkou. Mobil: bottom sheet. Desktop: rozbalení na místě.
- **Posuvník Q1**: velká hodnota nad posuvníkem, kotvy jako svislé značky, krok 0,1 mld, tlačítka −/+, ovládání klávesnicí.
- **Průběh**: segmentovaný pruh nahoře v trikolóře.
- **Primární akce**: na mobilu přilepená dole, přes celou šířku.
- **Grafy**: vodorovné pruhy, popisky přímo u pruhů, bez legend, pořadí podle možností (ne podle četnosti).

### 4.5 Vlajka

Motiv je geometrie vlajky (modrý klín do poloviny délky). Čisté SVG + CSS transformace, bez GIF/videa/Lottie, váha pod 5 kB, nic ve smyčce.

| Místo | Pohyb |
| --- | --- |
| Hlavní stránka, hero | jednou při načtení: klín se vysune, pruhy dojedou, 400–600 ms |
| Průběh kompasu | plnění po každé otázce |
| Potvrzení podpisu | rozvinutí přes obrazovku, max. 800 ms |
| Sdílecí obrázky, rámečky | statické |
| Čekání nad 300 ms | tenký pruh v trikolóře |

### 4.6 Výkon

- JS kompasu do 150 kB gzip.
- Testovat na 360 px šířky a profilu Slow 3G v Playwrightu.

---

## 5. Kompas

8 otázek, demografie, komentář. Každá otázka a volba má vysvětlivku (§11). Každá otázka má volbu „Nevím“. Na mobilu jedna otázka na obrazovku.

### 5.1 Otázky a volby

Texty jsou finální kandidáti, musí projít limity z §4.1.

**Q1 – Kolik peněz ročně má ČT a ČRo dostat?**
Posuvník 5,0–12,0 mld Kč, krok 0,1. Kotvy: „Návrh vlády“, „Dnes“, „Dnes +10 %“. Pod posuvníkem přepočet „≈ X Kč měsíčně na dospělého“. Volba „Nevím“.
Hodnoty kotev a počet dospělých jsou tvrzení se zdrojem (§11), ne konstanty v kódu. Pracovní hodnoty k ověření: návrh vlády 7,8 mld (ČT 5,74 + ČRo 2,065), dnes cca 9,2 mld.

**Q2 – Odkud mají peníze jít?**
1. Poplatek jako dnes
2. Zvláštní poplatek přes daně
3. Státní rozpočet s pojistkami
4. Návrh vlády
5. Státní rozpočet bez pojistek
6. Jen dobrovolné příspěvky
7. Nevím

**Q3 – Kdo určí, kolik dostanou?**
1. Zákon, s růstem podle inflace
2. Vláda a poslanci každý rok
3. Nezávislá komise na několik let
4. Nevím

**Q4 – Kdo má platit?**
1. Každá domácnost
2. Každý dospělý
3. Nikdo zvlášť, ze všech daní
4. Nevím

**Q5 – Má záležet na příjmu?**
1. Ne, všichni stejně
2. Ano, s horní hranicí
3. Ano, bez horní hranice
4. Stejně, ale se slevami
5. Nevím

**Q6 – Mají platit důchodci?**
1. Ano, stejně
2. Ano, méně
3. Ne
4. Nevím

**Q7 – Kdo nemá platit? (více voleb)**
Lidé s nízkým příjmem · Studenti · Lidé se zdravotním postižením · Lidé v hmotné nouzi · Platí všichni · Nevím

**Q8 – Mají platit firmy?**
1. Ne
2. Podle počtu zaměstnanců
3. Podle zisku, s horní hranicí
4. Podle obratu, s horní hranicí
5. Jen velké firmy
6. Nevím

### 5.2 Větvení

Uživatel vždy vidí všechny volby. Nedostupné jsou zašedlé se štítkem a vysvětlením. Změna dřívější volby zruší neplatné pozdější odpovědi a zvýrazní je.

| Q2 | Q3 | Q4–Q7 | Q8 |
| --- | --- | --- | --- |
| 1, 2 | vše | vše | vše |
| 3 | zašedne „Vláda a poslanci každý rok“ | jen Q4 „Nikdo zvlášť“, zbytek zašedne | jen „Ne“ |
| 4 | předvyplní „Zákon…“, zbytek zašedne | jako 3 | jako 3 |
| 5 | předvyplní „Vláda a poslanci…“, zbytek zašedne | jako 3 | jako 3 |
| 6 | celé zašedne | celé zašedne | celé zašedne |
| 7 | vše | vše | vše |

Pravidla jsou v `questions.yaml` jako data. Unit testy pokrývají všechny kombinace.

### 5.3 Demografie (vše nepovinné)

Kraj (14 krajů) · Věk: 18–29, 30–44, 45–59, 60+ · Velikost obce: do 2 000, 2 000–20 000, 20 000–100 000, nad 100 000 · Osobní komentář max. 500 znaků (zobrazí se jen na osobní stránce).

### 5.4 Stav v prohlížeči

Odpovědi se průběžně ukládají do `localStorage` (v try/catch). Kompas funguje bez serveru. Server je potřeba jen pro podpis.

---

## 6. Text k podpisu

- Skládá se deterministicky: pevný úvod + jedna věta za každou zodpovězenou otázku + pevný závěr. Žádné AI generování za běhu.
- Každá volba má jednu větu v `sentences.yaml` s ID a verzí. Q1 má věty podle pásma (pod návrhem vlády / návrh vlády / mezi / dnes / nad dnes) a doplní částku.
- „Nevím“ = „V otázce [téma] nechávám rozhodnutí na odbornících.“ (lze skrýt).
- Uživatel text nepřepisuje, mění jen volby. Náhled se aktualizuje živě (mobil: sbalené „Můj text“, desktop: vedlejší sloupec).
- Podpis ukládá `content_version` pro přesnou rekonstrukci.
- Funkce `composeStatement(answers, contentVersion)` je čistá, sdílená klientem i serverem, pokrytá testy.

---

## 7. Podpis, ověření, osobní stránka

### 7.1 Podpis

Pole: jméno (povinné), e-mail (povinný, nikdy se nezobrazí), „Zobrazit mé jméno“ (výchozí vypnuto), adresa (nepovinná), výslovný souhlas se zpracováním politického názoru (povinný checkbox, čl. 9 GDPR), Turnstile.

### 7.2 Ověření

- Po odeslání vznikne záznam `unverified` a e-mail s jednorázovým odkazem (platnost 7 dní).
- Do statistik se počítá až po ověření.
- Jeden e-mail = jeden aktivní podpis. Nový podpis ze stejného e-mailu nahradí starý (historie v `signature_version`). Odpověď API je stejná, ať e-mail existoval, nebo ne.
- Úrovně: `unverified`, `email`. Připravit enum pro budoucí `sms`, `bankid`.

### 7.3 `/v/{uuid}`

- Zobrazuje: podepsaný text, odpovědi, komentář, datum, úroveň ověření, jméno jen se souhlasem.
- Hlavní akce: Sdílet, Porovnat se, Můj zákon. Pod nimi blok „Kde stojíme my“.
- Úprava a odvolání jen přes odkaz z e-mailu („pošlete mi odkaz pro úpravu“). UUID zůstává.
- Odvolání smaže osobní údaje. Odpověď zůstane anonymně v agregacích.
- `noindex`. Tlačítko „Nahlásit“ (formulář na e-mail spolku, pro zjevně protiprávní obsah komentáře).

---

## 8. Statistiky a srovnání

- `/statistiky` a hlavní stránka. Zobrazovat od nuly.
- Počet ověřených podpisů, zvlášť počet čekajících.
- Rozložení odpovědí po otázkách, filtry kraj / věk / velikost obce, top 10 kombinací.
- Pod každým grafem: „Vzorek lidí, kteří kompas vyplnili. Není to reprezentativní průzkum.“
- `/v/{uuid}/srovnani`: u každé otázky % lidí se stejnou odpovědí. Shoda se stranami a hnutími = podíl otázek se stejnou odpovědí. Nepočítají se „Nevím“ a zašedlé. Q1 se shoduje při stejném pásmu. Řazení abecedně.
- Otevřená data: agregované CSV, kategorie pod 10 lidí sloučené.

---

## 9. Blok „Kde stojíme my“, akce, fotka, sdílení

### 9.1 Blok postoje

Komponenta s inverzní modrou plochou. Jedna věta z `stance.yaml` (`TODO(owner)`) + tlačítka Napsat zástupcům (`/akce`) a Profilová fotka (`/fotka`). Na hlavní stránce hned pod kompasem, na osobní stránce pod hlavními akcemi.

### 9.2 `/akce` – dopisy

Pro lidi, kteří nesouhlasí s vládním návrhem. S podpisem se předvyplní z něj, bez podpisu z odpovědí v prohlížeči.

Adresáti (více voleb):

| Adresát | Jak se najde | Zdroj dat |
| --- | --- | --- |
| Poslanci za můj kraj (lze vybrat jednotlivě) | kraj | otevřená data PSP |
| Můj senátor | obec → senátní obvod | senat.cz + číselník obcí a obvodů |
| Zastupitelstvo mého kraje | kraj | adresa a datová schránka krajského úřadu (seznam OVM) |
| Zastupitelstvo mé obce | obec | adresa a datová schránka obecního úřadu (seznam OVM, RÚIAN) |
| Ministr kultury | – | statický kontakt |
| Prezident republiky | – | statický kontakt |

Dopis = oslovení podle adresáta + jádro z vět podepsaného textu + žádost podle adresáta + volitelný blok „Nesouhlasím se způsobem projednávání“ + volitelná vlastní věta + patička „Připraveno pomocí [název]“ (výchozí zapnuto, lze vypnout).

Generátor stylu:

- Posuvník Forma (3 stupně): stručná zpráva · běžný dopis · formální dopis.
- Posuvník Délka a důraznost (3 stupně): krátký a zdvořilý · střední · delší a důrazný.
- Tlačítko „Jiná varianta“ změní seed. Seed a posuvníky jsou v URL.
- `letters/*.yaml`: každá pozice (oslovení, úvod, přechod, žádost, závěr) má 3–5 variant označených stupni. Min. 100 různých kombinací na typ adresáta. Varianty mění formulace, nikdy fakta.

Výstupy: text ke zkopírování, `mailto:`, PDF A4 (varianta pro okénkovou obálku), u úřadů ID datové schránky a 3řádkový návod, ZIP všech PDF. Vše v prohlížeči. Obsah dopisů se neukládá. Server dostane jen anonymní událost `letter_prepared` (typ adresáta).

### 9.3 `/fotka`

- Nahrání fotky, ořez a posun (gesta / myš), zoom, otočení podle EXIF. HEIC fallback dekodér.
- Varianty: kruhový pruh v trikolóře se sloganem po oblouku · stuha přes spodní třetinu · štítek v rohu · duotone se sloganem přes střed.
- Slogany jen ze `slogans.yaml`: „Ruce pryč od médií“, „Média nedáme“, „Veřejnoprávní média mi nejsou jedno“ (znění upravil vlastník 2026-10-28).
- Výstup 1080×1080 PNG a JPG, náhled s kruhovým ořezem. Metadata se odstraní.
- Fotka nikdy neopustí prohlížeč. Server dostane jen anonymní událost `frame_downloaded` (varianta, slogan).
- Žádná loga ČT ani ČRo.
- Krátký návod: Facebook rámečky už nemá, fotku stáhni a nahraj ručně.

### 9.4 Sdílení

| Moment | Věta | Na obrázku |
| --- | --- | --- |
| Podpis | Vím, jak chci financovat veřejnoprávní média | 3 klíčové volby |
| Můj zákon | Sestavil/a jsem vlastní verzi zákona o financování ČT a ČRo | „Můj zákon“ + hlavní volba |
| Dopisy | Napsal/a jsem svým zástupcům | počet adresátů podle typu |
| Fotka | Nová profilová fotka | fotka |
| Srovnání | Shoduji se s X % lidí, kteří kompas vyplnili | míra shody (nikdy se stranami) |

Formáty: OG 1200×630 (server, `next/og`, cache), Story 1080×1920 a čtverec 1080×1080 (klient). Mobil: Web Share API se souborem. Desktop: tlačítka sítí, kopírovat odkaz, stáhnout. Odkaz nese `?s=<moment>` pro cookieless počítání. Jméno na obrázku jen se souhlasem.

---

## 10. Můj zákon

- Samostatný zákon „o financování médií veřejné služby“ ze společného základu + modulů podle odpovědí.
- Moduly: Q1 výše · Q2 zdroj (6) · Q3 stanovení výše (3) · Q4+Q5 poplatník a výpočet · Q6+Q7 osvobození · Q8 firmy (5). „Nevím“ = „[Tuto otázku ponechávám na zákonodárci.]“.
- Matice kompatibility v `law/compatibility.yaml`. Číslování paragrafů se dopočítá.
- Výstup PDF + DOCX v prohlížeči. Hlavička: verze modulů, datum, UUID.
- Každý modul má `legal_review: pending | approved`. Dokud není vše `approved`, výrazný štítek „Pracovní verze, neprověřeno právníkem“. Vždy: „Ilustrativní text složený z modulů. Neprošel legislativním procesem.“
- Texty modulů napiš jako pracovní návrh. Vzory: švédský model (oddělený účet), finský (Yle daň), norský (víceletý rámec), německá KEF, vládní návrh. Fakta o vzorech jdou přes §11.

---

## 11. Obsah, zdroje a ověřování (agentní pipeline)

Každá vysvětlivka i každé číslo na webu musí mít ověřený zdroj. Ověřování dělají nezávislí agenti. Celá pipeline je součástí repozitáře a její výsledky jsou veřejné na `/metodika/zdroje`.

### 11.1 Formát

`content/explainers/<id>.yaml`:

```yaml
id: q2-opt2
text: |            # max. 4 věty, lidsky
  ...
pro: "..."          # jedna věta
proti: "..."        # jedna věta
claims:
  - id: q2-opt2-c1
    claim: "Švédsko vybírá poplatek spolu s daní z příjmu."   # jedna věta, přesně to, co tvrdíme
    source_url: "https://..."
    source_title: "..."
    locator: "sekce / strana / odstavec"
    quote: "..."    # max. 15 slov, nepovinné
```

`content/verification/<claim-id>.json`:

```json
{ "claim_id": "q2-opt2-c1", "verdict": "ano|ne|oprava", "correction": "", "note": "", "url_checked": "", "checked_at": "ISO", "verifier": "subagent-id", "round": 1 }
```

### 11.2 Postup

1. **Rešeršní agenti** (paralelně, jeden na otázku + jeden na čísla Q1 a demografii): napíšou vysvětlivky a tvrzení. Smí použít jen fakta ze stránek, které skutečně otevřeli. Přednost mají primární zdroje: text vládního návrhu a sněmovní tisk, zákony, oficiální stránky (Skatteverket, Yle, NRK, KEF, ČSÚ, PSP), ČTK.
2. **Ověřovací agenti** (jeden na tvrzení, vždy jiná instance než autor, bez kontextu rešerše): dostanou jen `claim`, `source_url`, `locator`. Musí zdroj otevřít a odpovědět `ano`, `ne`, nebo `oprava` s návrhem opraveného znění. Nic jiného nehodnotí.
3. Při `ne` nebo `oprava` rešeršní agent tvrzení upraví nebo najde jiný zdroj. Nové ověření dělá **nový** ověřovací agent. Max. 2 kola, pak `needs_human`.
4. **Agent nestrannosti** (nezávislý): zkontroluje každou vysvětlivku. Hodnotí zabarvené výrazy, zda jsou „pro“ i „proti“, jejich délka (rozdíl max. 20 %) a stejný tón u všech voleb včetně „Návrh vlády“. Výstup `ano` / `ne` + opravy.
5. **Agent srozumitelnosti** (nezávislý): kontroluje délky, odborné pojmy a úroveň „pochopí každý“. Používá seznam zakázaných výrazů v `content/plain-language.yaml` (např. mandatorní výdaj, valorizace, indexace, progresivní, regresivní, státní podpora → lidská náhrada).

### 11.3 Brány

- `pnpm verify:content` selže, pokud některé zobrazené tvrzení nemá poslední verdikt `ano`, pokud chybí review nestrannosti nebo srozumitelnosti, nebo pokud se tvrzení změnilo po ověření (hash tvrzení v záznamu).
- V produkci se vysvětlivka bez kompletního ověření nezobrazí. Místo ní stojí „Vysvětlivka se připravuje“.
- Každý záznam má pole `human_reviewed: false`. Na `/metodika` stojí otevřeně, že ověření dělají AI agenti a které položky už prošly i lidskou kontrolou.

### 11.4 Jazyk

- Krátké věty, běžná slova. Čísla zaokrouhlená a lidsky („asi 9 miliard ročně“, „asi 70 Kč měsíčně“).
- Zahraniční příklady jednou větou: „Ve Švédsku se platí spolu s daní a peníze jdou na zvláštní účet mimo státní rozpočet.“
- Žádné citace delší než 15 slov. Jinak vlastními slovy.

---

## 12. Strany a hnutí

- `/hnuti`: odpovědi stran a hnutí, abecedně, včetně „Neodpověděl/a (pozváno dne …)“.
- Pozvánka: `pnpm org:invite --name "…" --type strana|hnuti|iniciativa --contact "…"` vytvoří záznam a vypíše unikátní odkaz `/org/{token}` k ručnímu odeslání. Žádné admin rozhraní.
- `/org/{token}`: stejný kompas + ke každé otázce odůvodnění do 300 znaků. Po odeslání uzamčeno, token zneplatněn, změny nelze.
- V seedu jen fiktivní subjekty („Strana A“, „Hnutí B“). Nikdy nevymýšlet odpovědi skutečných subjektů.

---

## 13. Stránky

| Cesta | Obsah |
| --- | --- |
| `/` | Vlajka (animace), otázka „Jak by se měla platit veřejnoprávní média?“, tlačítko do kompasu · blok „Kde stojíme my“ · počet vyplněných kompasů a jeden graf · řádek o metodice · patička |
| `/kompas` | 8 otázek, vysvětlivky, náhled textu |
| `/kompas/podpis` | text, formulář, souhlas |
| `/overeni/[token]` | potvrzení, přesměrování |
| `/v/[uuid]` | osobní stránka |
| `/v/[uuid]/srovnani` | srovnání |
| `/v/[uuid]/zakon` | Můj zákon |
| `/akce` | dopisy |
| `/fotka` | profilová fotka |
| `/statistiky` | grafy a filtry |
| `/hnuti` | strany a hnutí |
| `/metodika` + `/metodika/zdroje` | metodika, knihovna vět, všechny zdroje s verdikty ověření, otevřená data |
| `/o-projektu` | spolek (`TODO(owner)`), kontakt, repozitář |
| `/soukromi` | zásady zpracování |
| `/org/[token]` | neveřejné, formulář pro subjekty |
| `/.well-known/security.txt` | kontakt pro hlášení zranitelností |

---

## 14. Data, architektura, bezpečnost

### 14.1 Schéma (Postgres, schéma `app`, ne `public`)

| Tabulka | Pole | Poznámka |
| --- | --- | --- |
| `signature` | `id uuid`, `answers jsonb`, `content_version`, `region`, `age_group`, `municipality_size`, `comment`, `verification_level`, `verified_at`, `withdrawn_at`, `is_seed`, `is_poc`, `created_at` | bez osobních údajů |
| `signer` | `id`, `signature_id`, `name_enc`, `show_name`, `email_enc`, `email_hmac` (unique), `address_enc`, `consent_at` | AES-256-GCM aplikačním klíčem z env |
| `signature_version` | `signature_id`, `answers`, `content_version`, `created_at` | historie |
| `email_token` | `signer_id`, `token_hash`, `purpose` (verify, edit), `expires_at`, `used_at` | jednorázové |
| `email_job` | `id`, `signer_id`, `kind`, `status`, `attempts`, `next_attempt_at`, `last_error` | fronta |
| `organization` | `id`, `name`, `type`, `contact`, `invited_at`, `token_hash`, `submitted_at`, `answers`, `justifications`, `is_seed` | |
| `event_counter` | `kind`, `key`, `day`, `count` | anonymní počty (dopisy, fotky, sdílení) |
| `rate_limit` | `bucket`, `window_start`, `count` | IP jen jako HMAC s denní solí |

Na všech tabulkách zapnout RLS bez politik. Schéma `app` nesmí být vystavené v Data API Supabase. Aplikace se připojuje vlastní rolí s minimálními právy, migrace jinou rolí.

### 14.2 Architektura pro špičky

Cíle (ověřit k6 proti stagingu): 50 000 návštěvníků za 10 minut, 20 000 lidí souběžně v kompasu bez dotazu na server, podpisy 200/s krátkodobě a 50/s trvale, p95 z CDN pod 300 ms, statistiky zpožděné max. 60 s.

- **Static-first**: obsah, kompas, adresáře a šablony jsou statické. Kompas, texty, dopisy, PDF, DOCX a fotky se počítají v prohlížeči.
- **Statistiky**: `GET /api/stats` počítá agregace jedním SQL dotazem a vrací `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. Hlavní stránka ISR `revalidate = 60`. Při špičce tak jde do DB max. jeden dotaz za minutu a region.
- **Osobní stránka**: cache s tagem `sig:<uuid>`, při úpravě `revalidateTag`.
- **Zápis podpisu**: ověří Turnstile, rate limit, zod, zapíše `signature` + `signer` + `email_job` v jedné transakci a vrátí odpověď. E-mail se pošle přes `after()`. Neúspěšné úlohy dočistí `GET /api/cron/email` (chráněno `CRON_SECRET`), spouštěné Vercel Cronem a navíc `pg_cron` + `pg_net` v produkci (migrace podmíněná existencí extenze).
- **Pooling**: `DATABASE_URL` přes Supavisor v transaction módu (`prepare: false`), `DIRECT_URL` jen pro migrace.
- **Degradace**: DB nedostupná → statické části fungují, statistiky ze stale cache, podpis vrátí „zkuste to za chvíli“ a odpovědi zůstanou v prohlížeči. Env `READ_ONLY=1` vypne zápis s oznámením.

### 14.3 Bezpečnost

- Šifrování osobních údajů AES-256-GCM (`PII_ENCRYPTION_KEY`), deduplikace e-mailu přes HMAC (`HMAC_KEY`). Tokeny jen jako SHA-256 hash.
- Striktní CSP s nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera jen pro `/fotka`, pokud bude potřeba).
- Uživatelský obsah jen jako prostý text.
- Rate limity: podpis 5/h na IP, 3/h na e-mail. Žádost o odkaz pro úpravu 3/h na e-mail.
- Blokace jednorázových e-mailových domén (statický seznam v repu).
- Logy bez osobních údajů. IP jen jako HMAC s denní solí, uchování max. 7 dní.
- Žádné externí skripty kromě Turnstile a volitelně Plausible.
- Závislosti: lockfile, minimum balíčků, Dependabot, `pnpm audit` v CI.
- Seed: `is_seed = true`. Agregace seed vylučují, pokud není `DEMO_MODE=1`. V `DEMO_MODE` je na všech stránkách se statistikami pruh „Ukázková data“. Produkční start odmítne běžet, když jsou v DB seed záznamy a `DEMO_MODE` není zapnutý.

### 14.4 GDPR

- Výslovný souhlas (čl. 9), samostatný checkbox s textem v `ui.yaml`.
- `/soukromi`: správce (`TODO(owner)`), účel, právní základ, zpracovatelé (Vercel, Supabase, poskytovatel e-mailu, Cloudflare Turnstile, případně Plausible), retence (`TODO(owner)`, návrh 12 měsíců po skončení projektu), práva a jak je uplatnit.
- Připravit šablonu DPIA v `docs/dpia.md` k doplnění vlastníkem.

---

## 15. Milníky (pořadí = priorita)

Po každém milníku commit a zelené testy. Nasazení je rozptýlené mezi milníky, aby něco běželo živě co nejdřív.

0. **Fáze 0** s vlastníkem (§0.1).
1. **Základ**: Next.js, Tailwind tokeny, font, layout, komponenty z §4.4, vlajka, PGlite dev DB, Drizzle, první migrace, testy a skripty (`lint`, `typecheck`, `test`, `lint:content`, `verify:content`, `build`).
2. **Obsah a kompas**: zod schémata obsahu, `questions.yaml`, `sentences.yaml`, `ui.yaml`, větvení, `composeStatement`, kompas v prohlížeči, mobil jedna otázka na obrazovku.
3. **Rešerše na pozadí (§11)**: hned po milníku 1 spusť rešeršní agenty paralelně a nech je běžet souběžně s vývojem. Postupně ověřovací agenti, nestrannost, srozumitelnost. Nikdy neblokuje další milníky. Neověřené vysvětlivky ukazují „Vysvětlivka se připravuje“.
4. **Seed**: `pnpm seed` vytvoří 500 ukázkových podpisů s pevným seedem, různorodé rozložení, fiktivní jména, e-maily `@example.invalid`, 3 fiktivní subjekty. `pnpm seed:clear`. Navíc export statického snímku statistik ze seedu pro virtuální nasazení.
5. **Statistiky, srovnání, hlavní stránka**.
6. **Virtuální nasazení (§16 A)**: první živá verze na Vercelu bez databáze.
7. **Podpis**: API, šifrování, POC ověření (§0.3), e-mail adaptér, osobní stránka, úprava a odvolání.
8. **Supabase a POC nasazení (§16 B)**, pokud vlastník ve Fázi 0 schválil založení projektu. Jinak vše připrav podle §16 C a pokračuj.
9. **Sdílení**: OG obrázky, story a čtverec, Web Share.
10. **Akce**: adresáře (importéry + fixture, skutečný import, pokud síť dovolí), generátor dopisů, PDF, ZIP.
11. **Můj zákon**: moduly, kompatibilita, PDF a DOCX.
12. **Fotka**.
13. **Strany a hnutí**: `org:invite`, `/org/[token]`, `/hnuti`.
14. **Metodika, O projektu, Soukromí, security.txt**.
15. **Bezpečnost a výkon**: hlavičky, rate limity, kontrola seed a POC, `READ_ONLY`, k6 skript, Lighthouse mobil ≥ 95 výkon a přístupnost.
16. **E2E**: Playwright projde celou cestu na mobilu i desktopu: kompas → podpis → POC ověření → osobní stránka → srovnání → zákon → akce → fotka.
17. **Finální nasazení** aktuální verze (§16 B nebo A) a `HANDOFF.md` (§18).

---

## 16. Nasazení

Všechno přes Supabase MCP, Vercel MCP, git a případně CLI, které jsou přihlášené. Vercel projekt `obcansky-kompas`, region funkcí `fra1` ve `vercel.json`.

- Preferuj propojení Vercel projektu s GitHub repozitářem, aby každý push na `main` nasadil produkci a každá větev náhled.
- Když propojení nejde provést bez prohlížeče, nasazuj přímo (MCP, případně `vercel deploy --prod`) a propojení zapiš do `HANDOFF.md` jako nepovinný krok.
- Env proměnné nastavuj přes Vercel MCP, případně `vercel env add` neinteraktivně. Hodnoty nikdy necommituj.

### A. Virtuální nasazení (bez databáze)

- Env `STATIC_DEMO=1`: statistiky se čtou ze statického snímku seedu, podpis je vypnutý s hláškou „V ukázce zatím nelze podepsat“. Vše ostatní (kompas, text, zákon, dopisy, fotka) funguje, protože běží v prohlížeči.
- `vercel deploy --prod` (bez domény, na `*.vercel.app`). Ověř přes `curl`: hlavní stránka, `/kompas`, `/api/stats`.
- URL zapiš do `HANDOFF.md`.

### B. Supabase + POC nasazení

1. Vygeneruj vlastní klíče (`PII_ENCRYPTION_KEY`, `HMAC_KEY`, `CRON_SECRET`) do `.env.setup.local` (v `.gitignore`).
2. Přes Supabase MCP založ projekt `obcansky-kompas` v regionu `eu-central-1` (EU), po schváleném potvrzení nákladů z Fáze 0. Před tím zkontroluj, že stejnojmenný projekt neexistuje.
3. Počkej, až je projekt připravený (stav přes MCP, max. 10 minut).
4. Migrace aplikuj přes Supabase MCP (stejné SQL jako v `supabase/migrations/`). Aplikační role s minimálními právy a vlastním heslem. Schéma `app` nesmí být vystavené v Data API (ověř dotazem, že přes REST není dostupné). `pg_cron` a `pg_net` zapni migrací, jen když jsou dostupné. Connection stringy (pooler + přímé) sestav pro aplikační roli.
5. Nahraj seed jako POC data.
6. Vercel env (production): `DATABASE_URL`, `DIRECT_URL`, klíče, `POC_MODE=1`, `DEMO_MODE=1`, `STATIC_DEMO=0`, testovací Turnstile klíče. `vercel deploy --prod`.
7. Smoke test přes `curl` a jeden Playwright běh proti produkční URL: kompas → podpis → POC ověření → osobní stránka.
8. Cron: Vercel Cron na plánu Hobby běží jen denně. Zpracování e-mailů proto zajišťuje hlavně `after()` a `pg_cron` + `pg_net`. Vercel Cron jen jako denní pojistka.

### C. Když vlastník založení projektu neschválil

Všechno připrav tak, aby celé B šlo provést jednou instrukcí. V `HANDOFF.md` bude jako jediný povinný krok vlastníka: „Řekni nové session: Přečti HANDOFF.md a proveď §16 B.“ Session pak jen potvrdí náklady s vlastníkem a zbytek udělá sama.

### D. Co zůstane na vlastníkovi pro ostrý provoz (ne pro POC)

Doména a DNS, odesílací doména s SPF/DKIM/DMARC a ostrý poskytovatel e-mailu, Turnstile klíče pro doménu, hardwarové 2FA na všech účtech, `TODO(owner)` položky, `pnpm poc:clear` a `POC_MODE=0`. Vše sepiš do `HANDOFF.md` jako kontrolní seznam.

Env (`.env.example`):

```
NEXT_PUBLIC_SITE_URL=
DATABASE_URL=            # pooler, transaction mode
DIRECT_URL=              # přímé spojení pro migrace
PII_ENCRYPTION_KEY=      # 32 B base64
HMAC_KEY=                # 32 B base64
CRON_SECRET=
EMAIL_PROVIDER=console   # console | resend
EMAIL_API_KEY=
EMAIL_FROM=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=   # volitelné
DEMO_MODE=0
POC_MODE=0
STATIC_DEMO=0
READ_ONLY=0
```

Přístupy k Supabase, Vercelu a GitHubu jdou přes MCP a git, ne přes tokeny v env. Vlastní tajné hodnoty (klíče, heslo aplikační role, ref projektu) drží session v `.env.setup.local`, který je v `.gitignore` a nikdy nejde na Vercel.

---

## 17. Otevřené body pro vlastníka (`OPEN_QUESTIONS.md`)

- Název projektu a doména.
- Údaje spolku (správce osobních údajů, kontakt).
- Věta postoje v `stance.yaml`.
- Retence osobních údajů.
- Poskytovatel e-mailu a odesílací doména.
- Seznam stran a hnutí k pozvání.
- Právníci pro moduly zákona.
- Lidská kontrola vysvětlivek (ideálně lidé různých názorů).
- Soulad stylizované vlajky se zákonem o užívání státních symbolů (352/2001 Sb.).
- Cloudflare proxy před Vercelem (zatím jen Vercel + Turnstile).
- BankID později (smlouva s Bank iD, ceník).

---

## 18. Definice hotového

- GitHub repozitář `shatieu/obcansky-kompas` existuje a obsahuje celý kód.
- POC běží živě na Vercelu: ideálně s databází (§16 B), minimálně virtuálně (§16 A) s vše připraveným pro §16 C.
- `pnpm i && pnpm dev` spustí aplikaci s PGlite a `DEMO_MODE=1`, bez jakýchkoli externích klíčů.
- `pnpm test`, `pnpm e2e`, `pnpm lint:content`, `pnpm verify:content`, `pnpm build` projdou.
- Celá cesta z milníku 16 funguje na mobilu 360 px.
- Vysvětlivky mají zdroje a záznamy ověření, nebo jsou jasně označené jako připravované či `needs_human`.
- `.env.example`, `DECISIONS.md`, `OPEN_QUESTIONS.md` existují a jsou úplné.
- `HANDOFF.md` začíná třemi řádky: živá URL, stav (POC s DB / virtuální), a **co přesně má vlastník udělat** – co nejméně kroků, ideálně žádný, nanejvýš jedna věta pro novou session (§16 C). Pod tím: co je hotové, co ne, co se nepovedlo ověřit, a kontrolní seznam pro ostrý provoz (§16 D).
