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

- Lead session deleguje práci na subagenty (max. 5 souběžně), sama koordinuje, nasazuje a integruje.
