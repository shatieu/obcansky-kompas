# Research notes – agent A (Q1–Q4, facts.yaml, plain-language.yaml)

Date: 2026-10-28. All explainers are `status: draft`, `human_reviewed: false`. No verification records were created.

## Primary sources opened

- Government bill, sněmovní tisk 231/0 (10th term), filed 19 June 2026, approved by the government on 15 June 2026:
  - Bill text with explanatory report (PDF): https://www.psp.cz/sqw/text/orig2.sqw?idd=277415. Page numbers in locators are pages of this PDF.
  - RIA (PDF): https://www.psp.cz/sqw/text/orig2.sqw?idd=277417
  - History of the bill: https://www.psp.cz/sqw/historie.sqw?o=10&t=231
  - Government news item: https://vlada.gov.cz/cz/media-centrum/aktualne/vlada-andreje-babise-schvalila-navrh-na-zmenu-financovani-ceske-televize-a-ceskeho-rozhlasu-227533/
- Zákon 348/2005 Sb. on zakonyprolidi.cz, version in force from 1 Jan 2026: § 3, § 4, § 5, § 6.
- Ústava čl. 42 on zakonyprolidi.cz.
- ČSÚ data set OBY02B, population by single year of age (full CSV downloaded and summed).
- Skatteverket page on the public service fee; vero.fi page on the Yle tax; KEF pages "Zur Arbeit der Kommission" and "Mitglieder"; rundfunkbeitrag.de home page; Stortinget Innst. 4 L (2019–2020).

## Open problems / for verifiers and the owner

1. **"Today" value (`today-total-bn` = 9.206 bn).** This is fee revenue **budgeted** for 2026 (ČT 6.730 + ČRo 2.476), taken from the RIA (p. 29). It is not actual revenue. I did not open the ČT/ČRo 2026 budget documents themselves. If the owner wants actual figures, use the 2025 annual reports (to be published in 2026). The SPEC working value of 9.2 matches.
2. **Government proposal = 2024 fee revenue.** The bill sets 5,741,826,000 Kč (ČT) and 2,065,766,000 Kč (ČRo), which are exactly the 2024 fee revenues (explanatory report p. 20). The total is 7.808 bn, which matches the SPEC's 7.8.
3. **`adults-count` = 8,886,675** is a **computed** value: the sum of ages 18–100+ for "Počet obyvatel k 31. 12.", Česko, 2025 in OBY02B. ČSÚ does not publish 18+ as a single number. Verifiers must download the CSV (about 300 MB) or use the DataStat selection OBY02BT01.
4. **Per-adult conversion is not written as a claim.** It is derived: about 86 Kč/month today and about 73 Kč/month under the proposal. The app should compute it from facts.yaml.
5. **Finland, Yle tax.** The vero.fi page does not state the tax year. The page was updated on 19 Dec 2025, so the figures (2.5 %, threshold 15,150 €, max 160 €) are probably for 2026. Verify the year.
6. **Sweden.** The fee is 1 % of taxable earned income, up to 1,184 SEK a year in 2026. I could not confirm on Skatteverket that the amount is "decided every year", so that claim is not used.
7. **EMFA (multi-year funding).** EUR-Lex returned an empty response (blocked). The claim is sourced to the bill's explanatory report, which quotes the EMFA preamble (p. 6). Better source to add later: Regulation (EU) 2024/1083, Art. 5(3) and the matching recital on EUR-Lex.
8. **Norway.** The source is Stortinget Innst. 4 L (2019–2020): the fee was abolished from 1 Jan 2020 and NRK is funded from the state budget. regjeringen.no returned 403. The bill's report also says Norway sets the NRK framework four years ahead, but I did not confirm this on a Norwegian primary source, so it is not used.
9. **Germany.** The explanatory report (p. 10) says the fee was 18.94 €/month in 2025. rundfunkbeitrag.de says 18.36 €, and 18.94 was the increase the broadcasters asked for, not one that took effect. **The bill's report looks wrong here.** I used rundfunkbeitrag.de. The KEF claims (16 independent experts, four-year periods, Länder decide and may depart from the recommendation only within narrow limits) come from kef-online.de.
10. **Question-level explainers (q1, q2, q3, q4)** have `pro: ""` and `proti: ""`, because a pro/con only makes sense for an answer option. If the lint requires non-empty values, decide the question-level format.
11. **Unsourced sentences.** Some sentences in text, pro and proti describe the option itself, for example "Lidé by přispívali jen tehdy, když sami chtějí." or "Člověk žijící sám platí stejně jako početná rodina." These are definitional or logical consequences, not claims about the world, so they have no claim. The neutrality and clarity agents should check them. This applies especially to q2-opt5 pro, q2-opt6 pro/proti, q3-opt1 pro/proti, q4-opt1 pro/proti and q4-opt2 pro/proti.
12. **Shared pro/proti wording.** The pro/con about the state budget ("odpadne administrativa" / "riziko závislosti na státu") comes from the explanatory report of the government bill itself (p. 9), and is supplemented by the RIA (p. 14) on annual approval. Using the government's own document for the weaknesses of state funding is deliberate, for neutrality.
13. **State of the bill.** It passed first reading. Per the psp.cz history page, the committee stage is open as of 28 Oct 2026. The amounts may change through amendments, so recheck facts.yaml before launch.
14. `plain-language.yaml`: "obrat" is deliberately **not** on the banned list, because it is part of the Q8 answer option in the SPEC.
