# Online demonstrace při 10 000 účastnících – odhad

Stav k 28. 10. 2026. Odhad z architektury (SPEC-demonstrace §6) a z měření produkce s 501 účastníky. Výkon prohlížeče při 10 000 lidech na reálném telefonu **neověřen**; lokální měření (desktop, iGPU) viz HANDOFF.md.

## Data

| Veličina | Hodnota | Zdroj |
| --- | --- | --- |
| Velikost položky v dlaždici | ≈ 110 B JSON, ≈ 37 B Brotli | změřeno: dlaždice 0 s 501 lidmi = 55 kB / 18,8 kB br |
| Plná dlaždice (1 000 lidí) | ≈ 110 kB / ≈ 37 kB br | výpočet |
| 10 000 lidí | 10 dlaždic, celkem ≈ 1,1 MB / ≈ 370 kB br | výpočet |

- Běžný výřez načte 1–4 dlaždice (≈ 40–150 kB br). Celých 10 dlaždic stáhne jen ten, kdo dav oddálí na tečky.
- Plné dlaždice jsou neměnné (pořadí se nemění), CDN je drží dlouho; mění se jen poslední, rostoucí dlaždice (cache 30 s). Databáze tak dostane jen několik dotazů za minutu bez ohledu na počet diváků.
- Skrytí nebo stažení podpisu musí dlaždici na CDN vyčistit (oprava z review právě běží).

## Prohlížeč

- 10 000 postav = 10 000 pozic, ale vykresluje se jen výřez. Podle přiblížení: zblízka plné animace s čitelnými cedulemi (max. 300 animovaných na mobilu, 1 500 na desktopu), dál statické siluety, při oddálení barevné tečky.
- Paměť: data 10 000 lidí jsou v řádu jednotek MB; textury cedulí se tvoří jen pro postavy blízko a ukládají se do cache.
- Očekávání: plynulé na desktopu (lokálně 60 fps i s 50 000), na středním Androidu cíl 30 fps – **neověřeno** na reálném zařízení.

## Plocha a orientace

- Dav roste po řadách od pódia dozadu a do stran; 10 000 lidí je asi 80–90 řad (po zvětšení rozestupů o něco víc). Výchozí pohled ukáže přední řady; minimapa, „Na konec davu“ a „Najdi mě“ zůstávají hlavní navigací.
- Najít sebe: zvýraznění v popředí a průhlední lidé před ním (úprava běží).

## Zápisy a moderace

- Připojení = 1 zápis do DB + případně 1 úloha moderace. 10 000 připojení za den je pod 0,2 zápisu/s v průměru; špička stovek za minutu je v limitech současné instance (Supabase Micro) – zátěžový test k6 **nespuštěn**.
- AI moderace (když se zapne): ≈ 1 volání modelu na vlastní slogan nebo jméno; předvolby a náhodní panáčci z podpisu moderaci nepotřebují.
- Nahlášení: skrytí po 3 nezávislých nahlášeních s Turnstile a globálním limitem (oprava z review běží).

## Náklady

- Čtení davu jde z CDN; 10 000 účastníků přidá k provozu jen jednotky MB přenosu na diváka, který projde celý dav. Odhad nákladů na 1 000 návštěvníků je v artefaktu „Provozní náklady kompasu“; dav ho mění zanedbatelně, pokud se dlaždice drží na CDN.

## Rizika při růstu

1. Čištění CDN po skrytí textu (právě se opravuje) – bez něj by skrytý text mohl zůstat viditelný až den.
2. Výkon na slabých telefonech – nutné změřit na reálném zařízení.
3. Zneužití nahlášení ke skrývání – omezené opravou, sledovat `pnpm demo:reported`.
