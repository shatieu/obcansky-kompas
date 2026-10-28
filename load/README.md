# Zátěžové testy (k6) – SPEC §14.2

Cíle: 50 000 návštěvníků za 10 minut, 20 000 lidí souběžně v kompasu (bez serveru – kompas
běží v prohlížeči, server vidí jen načtení stránky), podpisy 200/s krátkodobě a 50/s trvale,
p95 z CDN pod 300 ms, statistiky zpožděné max. 60 s.

**Nikdy v CI a nikdy proti produkci s ostrými podpisy.** Jen proti stagingu v POC režimu.

## Příprava stagingu

- Vercel preview / staging nasazení se `POC_MODE=1`, testovacími Turnstile klíči
  (`NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`,
  `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`) a vlastní DB (Supabase branch
  nebo samostatný projekt), ne produkční.
- Deployment Protection vypnutá nebo bypass token (`-e BYPASS=…` není v skriptu – přidej
  hlavičku `x-vercel-protection-bypass`, pokud je ochrana zapnutá).
- Podpisy z testu mají `is_poc = true`; po testu je smaže `pnpm poc:clear` (s `DATABASE_URL` stagingu).

## Spuštění

Instalace k6: <https://grafana.com/docs/k6/latest/set-up/install-k6/> (`winget install k6`, `brew install k6`).

```sh
# krátký kouřový běh (10 % délky)
k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=browse -e SCALE=0.1 load/k6/peak.js

# plné scénáře
k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=browse     load/k6/peak.js  # 85 návštěv/s, 10 min
k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=stats      load/k6/peak.js  # /api/stats 100/s
k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=sign       load/k6/peak.js  # podpis 50/s, 5 min
k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=sign-burst load/k6/peak.js  # podpis 200/s, 30 s
k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=all        load/k6/peak.js  # vše za sebou
```

Thresholds (test selže při nesplnění): p95 < 300 ms a < 1 % chyb pro statické stránky a
`/api/stats`; podpis p95 < 1,5 s a > 99 % odpovědí bez neočekávané 5xx.

## Na co pozor

- **Rate limit 5 podpisů/h na IP** (§14.3): z jednoho stroje projde jen prvních 5 podpisů,
  zbytek vrátí 429. I tak se měří Turnstile + zápis rate limitu do DB, ne celá transakce.
  Plný zápis podpisu při 50/200 za sekundu se dá změřit jen z mnoha IP (k6 Cloud, více
  generátorů) nebo na stagingu s dočasně zvýšeným limitem v `lib/rate-limit`.
- Turnstile testovací secret posílá každé ověření na Cloudflare siteverify; latence
  Cloudflare je součástí p95 podpisu.
- Statistiky: ověř zpoždění max. 60 s – během `sign` scénáře sleduj, že `/api/stats` vrací
  `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` a hodnota `verified`
  naroste nejpozději do minuty po ověření (ověření v POC jde přes odkaz na obrazovce).
- Výsledky (summary) zapiš do `HANDOFF.md`.
