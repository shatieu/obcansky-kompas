# Poznámky z rešerše B (Q5–Q8, law-models)

Stav: draft, nic není ověřené (`content/verification/` jsem nevytvářel). Všechna tvrzení jsou ze stránek, které jsem otevřel přes WebFetch 2026-10-28.

## Otevřené body

1. **Q8-opt4 (obrat s horní hranicí) nemá žádné tvrzení.** Nenašel jsem žádnou zemi, kde by firmy platily poplatek pro média veřejné služby podle obratu. Text je jen popis principu (`claims: []`). Agent nestrannosti by měl zkontrolovat, že nevadí, když tato volba nemá zahraniční příklad a ostatní ho mají.
2. **Q5-opt3 (bez horní hranice) a Q6-opt2/opt3** nemají příklad země, kde by to tak fungovalo. Ověřený je jen kontrast (FI/SE mají strop, CZ nemá výjimku podle věku).
3. **„Hmotná nouze“ (Q7-opt4):** zákon 348/2005 Sb. tento pojem nepoužívá. Osvobození je podle příjmu pod 2,15násobkem životního minima (§ 4 odst. 2), doklad je od „orgánu státní sociální pomoci“ (§ 4 odst. 3). Text to říká otevřeně. Rozdíl mezi volbou 1 (nízký příjem) a 4 (hmotná nouze) je v dnešním českém právu malý; je potřeba, aby to otázka vysvětlila.
4. **Zákon 348/2005 Sb. ve znění k 1. 1. 2026:** sazby 55/150 Kč, pásma pro firmy (25–49 zaměstnanců = 5×, … „více než 500“ = 100×). Mezi 499 a 500 je podle shrnutí stránky mezera, viz § 5 odst. 3. Než se tvrzení `cz_top` (q8-opt2-c3) ověří, je třeba přečíst přesné znění.
5. **Finsko, firmy:** zdroj říká „verotettava tulo“ (zdanitelný příjem). V textu pro čtenáře je „zisk“. Tvrzení jsou formulovaná přesně („zdanitelný příjem“). Agent srozumitelnosti nebo nestrannosti by měl rozhodnout, jestli zjednodušení „zisk“ stačí.
6. **Finsko, sazby:** podle yle.fi platí 2,5 %, hranice 15 150 € a strop 160 € od 1. 1. 2025. Stránka vero.fi byla aktualizovaná 19. 12. 2025 a uvádí stejné hodnoty. Nevím, jestli se pro rok 2026 nezměnily. Vyhledávání zmínilo vládní návrh, který by osvobodil další lidi s nízkým příjmem.
7. **Švédsko, hranice příjmu:** ve dvou podáních stránky Skatteverket se liší (118 300 vs. 118 427 SEK). Proto uvádím jen 1 % a strop 1 184 SEK pro rok 2026. Od 1. 1. 2026 platí nový zákon (2025:986). Ten jsem neotevřel.
8. **Německo, sleva RF:** stránka „Ausnahmen“ neuvádí výši slevy. Proto tvrzení říká jen „mohou požádat o snížení“. Částka 6,12 € pro RF je jen ze sekundárních zdrojů a nepoužil jsem ji.
9. **KEF:** stránka „Zur Arbeit der Kommission“ neuvádí počet členů ani slovo „unabhängig“. Proto o nezávislosti KEF nic netvrdím. Částku z 25. zprávy (18,64 € od 2027) jsem viděl jen ve shrnutí úvodní stránky, ne v doslovném citátu, a v law-de-c7 ji nepoužívám. Tisková zpráva KEF je PDF se skenovaným obrázkem a nedá se přečíst.
10. **Norsko:** stránky regjeringen.no vracejí 403. Fakta o víceletém rámci jsou z Innst. 365 S (2018–2019), kap. 10.1. To je **shrnutí** návrhu vlády ve zprávě výboru. Jestli se čtyřletý rámec opravdu používá (vyhledávání tvrdí, že poprvé v rozpočtu na rok 2023), jsem z primárního zdroje neověřil.
11. **Vládní návrh (CZ):** zdrojem je MediaGuru (sekundární), ne text návrhu ani sněmovní tisk. Číslo sněmovního tisku jsem nenašel. Článek si protiřečí v tom, o kolik se snižuje rozpočet ČRo (400 vs. 350 mil.). To jsem nepoužil. Až bude dostupný sněmovní tisk, zdroj je potřeba nahradit.
12. **Formát:** vysvětlivky k otázkám (q5, q6, q7, q8) nemají `pro`/`proti`, protože se týkají celé otázky, ne volby. Pokud lint vyžaduje `pro`/`proti` u všech, je potřeba to doplnit nebo upravit lint.
13. **Duplicitní tvrzení:** stejný fakt se opakuje pod různými id (např. CZ osvobození pro nízký příjem). Každý výskyt se ověřuje zvlášť. Pokud pipeline umí sdílená tvrzení, dají se sloučit.
