# SPEC – Online demonstrace

Rozšíření hotového webu Občanský kompas. Platí vše ze `SPEC.md` (design, architektura, bezpečnost, GDPR), pokud tento soubor neříká jinak. Před začátkem přečti `SPEC.md`, `HANDOFF.md` a `DECISIONS.md` a navaž na existující kód, tokeny, komponenty a vzory (fronta úloh, cache, seed, POC režim).

---

## 1. Co to je

Lidé, kteří podepsali kompas, se mohou připojit k online demonstraci. Vyberou si slogan, pózu a barvu cedule a dostanou vlastního panáčka. Ten se zařadí do rostoucího davu na jedné velké ploše. Každý panáček je trochu jiný a pohybuje se ve smyčce. Dav lze procházet, přibližovat a klepnutím zobrazit jméno a slogan. Každý má trvalé místo a odkaz, přes který se k sobě vrátí.

Patří k bloku „Kde stojíme my“, ne ke kompasu. Kompas zůstává nestranný.

---

## 2. Stránky

| Cesta | Obsah |
| --- | --- |
| `/demonstrace` | Dav přes celou obrazovku, počet účastníků, tlačítko „Připojit se“, „Zobrazit jako seznam“ |
| `/demonstrace/pripojit` | Výběr sloganu, pózy, barvy cedule, jména, živý náhled panáčka. Jen s ověřeným podpisem (jinak odkaz do kompasu) |
| `/demonstrace/[id]` | Dav vycentrovaný na daného panáčka, otevřená jeho karta |
| `/demonstrace/seznam` | Přístupná alternativa: stránkovaný seznam jmen a sloganů |

Napojení na existující stránky:

- Blok „Kde stojíme my“ dostane třetí tlačítko „Připojit se k demonstraci“ a živý počet účastníků.
- Osobní stránka `/v/[uuid]`: když člověk ještě není v davu, výzva k připojení. Když už je, odkaz „Můj panáček v davu“ a úprava.

---

## 3. Připojení

Krok za krokem, na mobilu jedna věc na obrazovku, náhled panáčka stále nahoře.

1. **Slogan**: výběr z předvoleb (`content/demonstrace/slogans.yaml`), nebo vlastní text max. 40 znaků.
2. **Póza**: 6 voleb (§5.3), náhled se hned animuje.
3. **Cedule**: bílá, modrá, nebo červená (barvy z tokenů).
4. **Vzhled**: tlačítko „Jiný panáček“ změní seed. Max. 20 změn, pak zůstane poslední.
5. **Jméno**: nepovinné, jen křestní jméno. Výchozí volba „Připojit se anonymně“.
6. **Souhlas**: samostatný checkbox „Souhlasím se zveřejněním svého sloganu a případně křestního jména“ (zveřejnění politického názoru, čl. 9 GDPR).
7. Potvrzení: krátká animace zařazení do davu (max. 800 ms), pak `/demonstrace/[id]` se sdílením.

Pravidla:

- Jeden panáček na jeden ověřený podpis. Úprava přes osobní stránku, místo v davu zůstává.
- Odvolání podpisu odstraní i panáčka.
- Rate limit: připojení a úpravy max. 10/h na podpis, 20/h na IP.

---

## 4. Moderace

Cíl: v davu se nikdy neobjeví vulgarita, nenávist ani podvržené jméno. Moderují se jen volné texty (vlastní slogan, jméno). Předvolby a vzhled moderaci nepotřebují.

### 4.1 Stupeň 1: skript (vždy, okamžitě)

Běží synchronně při odeslání, na serveru (a stejná funkce v prohlížeči pro okamžitou zpětnou vazbu). Zakázaný text se **ihned odmítne** s hláškou „Tento text nelze použít. Zkuste jiný.“ Bez dalšího vysvětlení, aby nešlo filtr obcházet zkoušením.

Normalizace před kontrolou:

- malá písmena, odstranění diakritiky,
- záměna znaků (`0→o`, `1→i/l`, `3→e`, `4→a`, `5→s`, `7→t`, `@→a`, `$→s`, cyrilice a řecké podobné znaky → latinka),
- odstranění mezer, teček, pomlček a dalších oddělovačů mezi písmeny (`k.r.e.t.e.n`),
- zkrácení opakovaných písmen (`kuuurva → kurva`).

Kontroly:

- `content/moderation/blocklist-cs.txt`: české a slovenské vulgarity, nadávky, urážky skupin a jejich tvary (kmeny + koncovky). Vyhledává se v normalizovaném textu i jako podřetězec, s malým allowlistem proti falešným shodám (`content/moderation/allowlist-cs.txt`, např. slova, která obsahují zakázaný kmen).
- `content/moderation/blocklist-en.txt`: nejběžnější anglické vulgarity.
- Odkazy, e-maily, telefonní čísla, `@` přezdívky, hashtagy: zakázané.
- Jméno: jedno slovo, jen písmena (včetně diakritiky a spojovníku), 2–20 znaků. Nesmí být na seznamu příjmení veřejně známých osob a politiků (`content/moderation/public-names.txt`), aby nešlo podvrhnout „Babiš“ nebo „Klempíř“.
- Slogan: 3–40 znaků, max. 50 % velkých písmen (jinak se převede), max. 2 emoji. Vlastní emoji ne, jen text.

Seznamy jsou v repozitáři, ale `/metodika` je nezveřejňuje celé (jen popis pravidel).

### 4.2 Stupeň 2: AI kontrola (jen s API klíčem)

- Zapnutá, když je nastavený `MODERATION_API_KEY`. Bez klíče se text, který prošel skriptem, rovnou schválí.
- S klíčem: text, který prošel skriptem, dostane stav `pending`. V davu se mezitím místo vlastního sloganu ukazuje výchozí předvolba a jméno se nezobrazí. Autor vidí svůj text na vlastním odkazu se štítkem „Čeká na kontrolu“.
- Úloha jde do fronty (stejný vzor jako `email_job`, tabulka `moderation_job`), zpracuje se přes `after()` a cron.
- Model vrátí strukturovaný výstup `{ "verdict": "ok" | "reject", "category": "vulgarita" | "nenavist" | "vyhruzka" | "utok_na_osobu" | "sexualni" | "reklama" | "podvrzene_jmeno" | "nesrozumitelne" | null }`.
- Instrukce modelu (v `content/moderation/ai-prompt.md`): odmítnout vulgarity i skryté nebo zakódované, nenávist, výhrůžky, útoky na konkrétní osoby, sexuální obsah, reklamu, podvržená jména. **Povolit** ostrou politickou kritiku vlády, zákona i politiků bez urážek, a stejně tak slogany opačného názoru. Text uživatele předávat jako data v oddělené části, nikdy jako instrukce.
- `reject` → stav `rejected`. Autor vidí na svém odkazu „Text neprošel kontrolou“ a může zadat jiný. V davu zůstane předvolba.
- Chyba nebo výpadek AI → zůstává `pending`, opakování s backoffem. Nikdy se neschválí automaticky kvůli chybě.
- Poskytovatel přes adaptér: `MODERATION_PROVIDER=none|anthropic`, `MODERATION_MODEL` (výchozí nastav rychlý levný model, např. Claude Haiku, hodnota jen v env).
- `pnpm moderation:recheck`: projde AI kontrolou všechny už schválené vlastní texty. Spustit poté, co se klíč přidá.

### 4.3 Nahlášení a skrytí

- Každá karta panáčka má „Nahlásit“. Max. 1 nahlášení na IP a panáčka.
- Po 3 nahlášeních od různých IP se vlastní text a jméno automaticky skryjí (v davu předvolba, bez jména) do ruční kontroly.
- Žádné admin rozhraní. CLI: `pnpm demo:reported` (výpis), `pnpm demo:hide <id>`, `pnpm demo:unhide <id>`, `pnpm demo:ban-text <id>` (trvale odmítne vlastní text).
- Každý zásah se zapíše do `moderation_log`.

---

## 5. Panáček

### 5.1 Generátor (`lib/stickman/`)

- Čistá deterministická funkce `generateStickman(seed) → params`. Stejný seed = stejný panáček všude (náhled, dav, sdílecí obrázek).
- PRNG ze seedu (např. mulberry32). Seed = náhodné 32bit číslo uložené u účastníka.
- Proměnné: výška (±12 %), velikost hlavy, délka paží a nohou, šířka ramen, mírný předklon nebo záklon, sklon hlavy, vlasy nebo pokrývka hlavy (žádné, krátké, delší, culík, čepice, kšiltovka, kulich), brýle (ano/ne), šála v trikolóře (malá šance), tvar cedule (obdélník, transparent na dvou tyčích, malá cedulka), rychlost a fáze animace.
- Styl: čáry v `--ink`, jednotná tloušťka, ostré konce, žádné stínování, hlava jako kruh (výjimka z pravidla rohů, je to postava). Cedule s ostrými rohy, text sázený písmem webu, automatické zalomení do max. 3 řádků a zmenšení písma.
- Dva výstupy ze stejných parametrů: SVG (náhled, sdílecí obrázky na serveru) a vykreslení v PixiJS (dav).

### 5.2 Animace

- Kostra z několika kloubů (krk, ramena, lokty, kyčle, kolena). Póza = sada úhlů v čase, smyčka 1,2–2,4 s.
- Rychlost ±20 % a fáze ze seedu, aby dav nebyl synchronní.
- `prefers-reduced-motion`: všichni stojí v klidové póze.

### 5.3 Pózy

| Póza | Pohyb |
| --- | --- |
| Drží ceduli | cedule nad hlavou, mírné pohupování |
| Mává cedulí | cedule ze strany na stranu |
| Pochoduje | kroky na místě, cedule na rameni |
| Tleská | ruce před tělem, cedule opřená o nohu |
| Skáče | malé poskoky |
| Zdvižená pěst | jedna ruka nahoře, druhá drží ceduli |

---

## 6. Dav

### 6.1 Rozvržení

- Jedna velká plocha (náměstí) při pohledu mírně shora. Řady, vzadu menší a výš (jednoduchá perspektiva: měřítko podle řady).
- Pozice podle pořadí připojení: první lidé vepředu uprostřed, dav roste dozadu a do stran (spirála po řadách). Malý náhodný posun ze seedu, aby nestáli v mřížce.
- `position_index` se přidělí při připojení ze sekvence a nikdy se nemění. Funkce `positionFor(index) → {x, y, scale}` je čistá a pokrytá testy.
- Pořadí vykreslení podle hloubky (zadní řady dřív).
- Pozadí jen jednoduché: plocha v `--surface`, jemné linky dlažby v `--blue-tint`, vepředu nízké pódium s vlajkovým klínem. Žádné ilustrace.

### 6.2 Ovládání

- Tažení, kolečko a pinch pro zoom, šipky na klávesnici.
- Minimapa v rohu (celý dav jako tečky, rámeček výřezu).
- „Najdi mě“ (když je uživatel v davu), „Na začátek“, „Na konec davu“ (nejnovější).
- Klepnutí na panáčka → karta: jméno (nebo „Anonym“), slogan, pořadí („2 481. účastník“), datum připojení, „Sdílet“, „Nahlásit“.
- URL drží pozici kamery (`?x=&y=&z=`), aby šel sdílet konkrétní výřez.

### 6.3 Výkon

- PixiJS v8 (WebGL, fallback canvas), načtený jen na stránkách `/demonstrace*` (dynamický import). Rozpočet JS stránky davu do 250 kB gzip.
- Textury: části postav a cedule jako sprity, text cedule předrenderovaný do malé textury a cachovaný.
- Úrovně detailu podle přiblížení:
  - blízko: plná animace a čitelné cedule,
  - středně: animace bez textu cedule,
  - daleko: statické siluety,
  - celý dav: barevné tečky.
- Animovaných postav najednou max. 300 na mobilu a 1 500 na desktopu (nejbližší ke středu výřezu). Ostatní statické.
- Mimo výřez se nic nevykresluje. Při skryté záložce se animace zastaví.
- Cíl: 60 fps na desktopu, min. 30 fps na středním Android telefonu při 50 000 účastnících.

### 6.4 Data a cache

- Dav je rozdělený na dlaždice po 1 000 účastnících podle `position_index`.
- `GET /api/demonstrace/tile/[n]` → kompaktní JSON (`[index, seed, pose, signColor, sloganId | text, name | null]`). Jen schválené texty, jinak předvolba a bez jména.
  - Plné dlaždice: `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`, invalidace tagem při skrytí nebo úpravě.
  - Poslední (rostoucí) dlaždice: `s-maxage=30, stale-while-revalidate=120`.
- `GET /api/demonstrace/meta` → počet, počet dlaždic, `s-maxage=30`.
- Klient načítá jen dlaždice ve výřezu a kolem něj.
- `GET /api/demonstrace/[id]` → index a data jednoho panáčka (pro `/demonstrace/[id]`).
- Při špičce tak čtení davu nesahá do databáze víc než párkrát za minutu.

---

## 7. Data

Nové tabulky ve schématu `app`:

| Tabulka | Pole | Poznámka |
| --- | --- | --- |
| `demonstrator` | `id uuid`, `signature_id` (unique), `position_index` (unique, ze sekvence), `seed`, `pose`, `sign_color`, `slogan_preset_id`, `slogan_custom`, `slogan_status` (`none`, `pending`, `approved`, `rejected`), `first_name`, `name_status` (stejné stavy), `consent_at`, `hidden_at`, `report_count`, `reroll_count`, `created_at`, `updated_at`, `is_seed`, `is_poc` | `slogan_custom` a `first_name` se do dlaždic dostanou jen ve stavu `approved` a bez `hidden_at` |
| `moderation_job` | `id`, `demonstrator_id`, `field` (`slogan`, `name`), `text_hash`, `status`, `attempts`, `next_attempt_at`, `last_error`, `verdict`, `category` | fronta AI kontroly |
| `demonstrator_report` | `demonstrator_id`, `ip_hmac`, `created_at` | unique na dvojici |
| `moderation_log` | `demonstrator_id`, `action`, `actor` (`script`, `ai`, `reports`, `cli`), `category`, `created_at` | audit |

RLS zapnuté bez politik, jako zbytek schématu.

---

## 8. Sdílení

| Moment | Věta | Obrázek |
| --- | --- | --- |
| Připojení | Připojil/a jsem se k online demonstraci | panáček s cedulí v popředí, za ním výřez davu, počet účastníků |

Formáty jako v `SPEC.md` §9.4: OG 1200×630 (server, SVG panáčka přes `next/og`), Story a čtverec (klient). Na obrázku jen schválený text a jméno se souhlasem.

---

## 9. Seed a POC

- `pnpm seed:demonstrace` vytvoří 500 účastníků navázaných na seedové podpisy (stávající seed má 500 podpisů, takže každý seedový podpis dostane jednoho panáčka): předvolby sloganů, pár desítek vlastních neutrálních sloganů, fiktivní křestní jména, všechny pózy a barvy. `is_seed = true`.
- Pro test výkonu `pnpm seed:demonstrace --count 50000` (jen lokálně a na stagingu).
- V `DEMO_MODE` stejný pruh „Ukázková data“ jako u statistik.
- V `STATIC_DEMO` se dlaždice čtou ze statického exportu seedu a připojení je vypnuté.

---

## 10. Env

```
MODERATION_PROVIDER=none     # none | anthropic
MODERATION_API_KEY=          # prázdné = jen skriptová kontrola
MODERATION_MODEL=
```

Bez klíče vše funguje, jen se volné texty schvalují po skriptové kontrole.

---

## 11. Testy

- Normalizace a blocklist: sada obcházecích pokusů (mezery, tečky, leetspeak, diakritika, opakování, cyrilice) musí být zachycena. Allowlist nesmí blokovat běžná slova ze sady neutrálních sloganů.
- Generátor: determinismus (stejný seed = stejné parametry a SVG snapshot), všechny pózy a doplňky se vykreslí bez chyby.
- `positionFor`: unikátní a stabilní pozice, žádné překryvy hlav pro prvních 100 000 indexů.
- Moderace: bez klíče `approved` po skriptu. S mockovaným AI `pending → approved/rejected`, chyba AI nechá `pending`. Nahlášení skryje po 3 různých IP.
- API: dlaždice nikdy neobsahují `pending`, `rejected` ani skryté texty.
- E2E (mobil 360 px i desktop): podpis → připojení → `/demonstrace/[id]` ukáže kartu → úprava sloganu → nahlášení.
- Výkon: Playwright změří fps na stránce davu se seedem 50 000 v desktopovém profilu a zapíše výsledek do `HANDOFF.md`.

---

## 12. Milníky

Po každém commit, zelené testy, push.

1. Datový model, migrace, API (připojení, úprava, dlaždice, meta).
2. Moderace stupeň 1 (skript) včetně seznamů a testů obcházení.
3. Generátor panáčka a animace (SVG náhled).
4. Stránka připojení.
5. Dav v PixiJS: rozvržení, ovládání, karta, LOD, minimapa, „Najdi mě“.
6. Seznamové zobrazení, napojení na blok postoje a osobní stránku.
7. Nahlášení a CLI.
8. Moderace stupeň 2 (AI adaptér, fronta, `moderation:recheck`), plně pokrytá testy s mockem.
9. Sdílení.
10. Seed, výkonový test, nasazení na Vercel (aplikovat migrace přes Supabase MCP).
11. Doplnit `HANDOFF.md`: URL davu, výsledek výkonového testu, jak zapnout AI kontrolu (nastavit tři env proměnné na Vercelu a spustit `pnpm moderation:recheck`).

---

## 13. Hotovo, když

- Připojení, dav, karta, seznam a sdílení fungují na mobilu i desktopu a na produkci.
- Skriptová moderace odmítne celou testovací sadu vulgarit a obcházení.
- Po nastavení `MODERATION_API_KEY` se nové texty kontrolují AI bez dalšího zásahu do kódu.
- Dav s 500 seedovými účastníky běží plynule na produkci.
- `/soukromi` a `/metodika` popisují zveřejnění jména a sloganu a pravidla moderace.
