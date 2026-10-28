# OPEN_QUESTIONS – rozhodnutí, která čekají na vlastníka

## Ze specifikace (§17)

- [ ] Název projektu a doména.
- [ ] Údaje spolku (správce osobních údajů, kontakt).
- [ ] Věta postoje v `content/stance.yaml`.
- [ ] Retence osobních údajů (návrh: 12 měsíců po skončení projektu).
- [ ] Poskytovatel e-mailu a odesílací doména.
- [ ] Seznam stran a hnutí k pozvání.
- [ ] Právníci pro moduly zákona.
- [ ] Lidská kontrola vysvětlivek (ideálně lidé různých názorů).
- [ ] Soulad stylizované vlajky se zákonem o užívání státních symbolů (352/2001 Sb.).
- [ ] Cloudflare proxy před Vercelem (zatím jen Vercel + Turnstile).
- [ ] BankID později (smlouva s Bank iD, ceník).

## Adresáře (`data/directories/`)

- [ ] Prezident: hrad.cz blokuje automatické dotazy (403) – e-mail a webový formulář chybí, doplnit ručně (adresa a datová schránka jsou ze seznamu OVM).
- [ ] 18 senátorů nemá na senat.cz zveřejněný e-mail.
- [ ] Praha-Petrovice: volby.gov.cz uvádí obvod 17, senat.cz 19 – stránka nabídne obě.

## Z rešerše (Q5–Q8, vzory zákona) – k lidské kontrole

Podrobnosti v `content/explainers/_research-notes-b.md`.

- [ ] Q8 „Podle obratu, s horní hranicí“: nenalezen žádný stát, který by tak vybíral od firem – vysvětlivka je bez tvrzení.
- [ ] Q7 „Lidé v hmotné nouzi“: zákon 348/2005 Sb. pojem nepoužívá (osvobození je podle příjmu do 2,15násobku životního minima) – volby 1 a 4 se dnes překrývají. Zvážit úpravu otázky.
- [ ] Vládní návrh = sněmovní tisk 231/0 (10. období), v 1. čtení schválen, ve výboru. Částky (ČT 5 741 826 000 Kč, ČRo 2 065 766 000 Kč) se mohou pozměňovacími návrhy změnit – před spuštěním znovu zkontrolovat `content/facts.yaml`. Vzory zákona (`law-models.yaml`) zatím citují MediaGuru – nahradit odkazem na tisk.
- [ ] „Dnes ≈ 9,2 mld“ je rozpočtovaný výnos poplatků 2026 podle RIA k tisku 231, ne skutečnost.
- [ ] Důvodová zpráva uvádí německý poplatek 18,94 €; rundfunkbeitrag.de 18,36 € – použito 18,36 €.
- [ ] Podrobnosti Q1–Q4 v `content/explainers/_research-notes-a.md`.
- [ ] Finsko (sazby 2026), Švédsko (zákon 2025:986), Norsko (regjeringen.no nedostupné), Německo (výše slevy RF) – údaje k ověření z primárních zdrojů.
