# DPIA – posouzení vlivu na ochranu osobních údajů (šablona)

Šablona podle čl. 35 GDPR pro Občanský kompas (SPEC §14.4). Vyplňuje **správce (spolek)**.
Předvyplněné jsou jen technické údaje, které vyplývají z kódu v tomto repozitáři. Vše
označené `TODO(owner)` musí doplnit a schválit vlastník; doporučujeme konzultaci s právníkem
nebo pověřencem pro ochranu osobních údajů.

- Verze dokumentu: TODO(owner)
- Datum: TODO(owner)
- Zpracoval/a: TODO(owner)
- Schválil/a: TODO(owner)

## 1. Proč je DPIA potřeba

Zpracováváme **politické názory** (odpovědi v kompasu spojené se jménem a e-mailem), tedy
zvláštní kategorii údajů podle čl. 9 GDPR, a to potenciálně ve velkém rozsahu (cíl desítky
tisíc podpisů). To odpovídá kritériím pro povinnou DPIA (čl. 35 odst. 3 písm. b), seznam
ÚOOÚ). TODO(owner): potvrdit.

## 2. Popis zpracování

| Položka | Popis |
| --- | --- |
| Správce | TODO(owner): název spolku, IČO, sídlo, kontakt |
| Pověřenec (DPO) | TODO(owner): je jmenován? kontakt |
| Účel | ověření a zveřejnění podpisu prohlášení o financování ČT a ČRo; osobní stránka podpisu; souhrnné anonymní statistiky; volitelně adresa pro dopisy zástupcům (generují se v prohlížeči) |
| Právní základ | výslovný souhlas, čl. 9 odst. 2 písm. a) a čl. 6 odst. 1 písm. a) GDPR (samostatné zaškrtávací pole, text v `content/ui.yaml` → `sign.consent_label`) |
| Subjekty údajů | dospělí lidé, kteří podepíšou prohlášení |
| Kategorie údajů | jméno, e-mail, volitelně adresa (šifrované AES-256-GCM); odpovědi (politický názor); volitelně kraj, věková skupina, velikost obce, komentář; čas souhlasu |
| Údaje, které neukládáme | IP adresa (jen HMAC s denní solí pro rate limit, max. 7 dní), cookies pro sledování |
| Příjemci | veřejnost: jen odpovědi, komentář a jméno se souhlasem (`show_name`); souhrnné statistiky a otevřená data (skupiny pod 10 lidí sloučené) |
| Zpracovatelé | Vercel Inc. (hosting, region fra1), Supabase Inc. (databáze, eu-central-1), poskytovatel e-mailu (TODO(owner)), Cloudflare, Inc. (Turnstile), volitelně Plausible Insights OÜ |
| Předávání mimo EHP | Vercel, Supabase a Cloudflare jsou americké společnosti. TODO(owner): ověřit DPA, EU–US Data Privacy Framework / standardní smluvní doložky |
| Doba uchování | TODO(owner): návrh 12 měsíců po skončení projektu, pak výmaz osobních údajů; anonymní agregace zůstávají |

### Tok dat

1. Kompas běží v prohlížeči, odpovědi jsou do podpisu jen v `localStorage`.
2. Podpis: `POST /api/sign` → Turnstile → rate limit → validace → jedna transakce
   (`signature` bez osobních údajů, `signer` se šifrovanými údaji, `email_job`).
3. Ověřovací e-mail s jednorázovým odkazem (v DB jen SHA-256 tokenu).
4. Osobní stránka `/v/{uuid}` ukazuje odpovědi, jméno jen se souhlasem.
5. Úprava a odvolání přes jednorázový odkaz z e-mailu; odvolání smaže `signer`
   (jméno, e-mail, adresu), odpovědi zůstanou anonymně.

## 3. Nezbytnost a přiměřenost

| Otázka | Odpověď |
| --- | --- |
| Je každý údaj nutný? | e-mail: ověření a odkaz pro úpravu; jméno: smysl podpisu; adresa: jen volitelně pro dopisy. TODO(owner): potvrdit |
| Minimalizace | demografie nepovinná a jen v hrubých kategoriích; IP neukládáme; logy bez osobních údajů |
| Přesnost | uživatel může odpovědi upravit odkazem z e-mailu |
| Informování | stránka `/soukromi`; odkaz u souhlasu |
| Odvolání souhlasu | kdykoli odkazem z e-mailu, stejně snadno jako udělení |
| Práva subjektů | přístup, oprava, výmaz, omezení, přenositelnost – TODO(owner): proces a lhůty pro žádosti mimo aplikaci |

## 4. Rizika

Hodnocení: pravděpodobnost × závažnost (nízká / střední / vysoká). TODO(owner): ohodnotit.

| # | Riziko | Dopad na lidi | Pravděpodobnost | Závažnost | Opatření |
| --- | --- | --- | --- | --- | --- |
| R1 | Únik databáze | odhalení politického názoru spojeného s e-mailem | TODO | vysoká | šifrování AES-256-GCM aplikačním klíčem mimo DB; RLS bez politik; schéma `app` mimo Data API; aplikační role s minimálními právy |
| R2 | Únik aplikačního klíče | dešifrování údajů | TODO | vysoká | klíče jen v env Vercelu; 2FA na účtech (TODO(owner): hardwarové klíče); rotace klíčů (TODO(owner)) |
| R3 | Podpis za jiného člověka | připsání názoru někomu jinému | TODO | střední | ověření e-mailem; jméno se zveřejní jen se souhlasem; nahlášení stránky (`/api/report`) |
| R4 | Zneužití formuláře roboty | zkreslení statistik | TODO | nízká | Turnstile, rate limity, blokace jednorázových domén |
| R5 | Profilování z otevřených dat | odhalení názoru v malé skupině | TODO | střední | skupiny pod 10 lidí sloučené, malé součty se nezveřejní |
| R6 | Zpracovatel mimo EHP | přístup orgánů třetí země | TODO | střední | TODO(owner): DPA, DPF/SCC, výběr regionu EU |
| R7 | Uchování déle, než je nutné | zbytečné riziko úniku | TODO | střední | TODO(owner): retence a skript pro výmaz |
| R8 | E-mailový poskytovatel vidí příjemce | spojení e-mailu s kampaní | TODO | nízká | e-mail bez odpovědí, jen odkaz; TODO(owner): výběr poskytovatele v EU |

## 5. Zbytková rizika a rozhodnutí

- Zbytkové riziko po opatřeních: TODO(owner)
- Je nutná předchozí konzultace s ÚOOÚ (čl. 36)? TODO(owner)
- Stanovisko pověřence: TODO(owner)
- Rozhodnutí správce: TODO(owner)

## 6. Revize

DPIA projít znovu před ostrým spuštěním, při změně zpracovatele, při přidání BankID / SMS
ověření a nejpozději za 12 měsíců. TODO(owner): odpovědná osoba.
