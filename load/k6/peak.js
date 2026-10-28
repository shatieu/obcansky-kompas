/**
 * k6 zátěžový test pro cíle SPEC §14.2. NIKDY v CI, nikdy proti produkci s ostrými daty.
 * Spouští se proti stagingu v POC režimu (POC_MODE=1, testovací Turnstile klíče) – viz load/README.md.
 *
 *   k6 run -e BASE_URL=https://<staging>.vercel.app -e SCENARIO=browse load/k6/peak.js
 *
 * SCENARIO:
 *   browse       – hlavní stránka, /kompas, /statistiky a /api/stats (50 000 návštěvníků / 10 min ≈ 85/s)
 *   stats        – jen GET /api/stats (s filtry), cache z CDN
 *   sign         – POST /api/sign trvale 50/s (5 min)
 *   sign-burst   – POST /api/sign krátce 200/s (30 s)
 *   all          – browse + stats souběžně, pak sign + sign-burst
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/+$/, "");
if (!BASE_URL) throw new Error("Nastav -e BASE_URL=https://… (staging, ne produkce)");
const SCENARIO = __ENV.SCENARIO || "browse";
const DURATION_SCALE = Number(__ENV.SCALE || 1); // 0.1 = krátký kouřový běh
// Oficiální testovací token Turnstile – projde jen s testovacím secret klíčem (POC).
const TURNSTILE_TOKEN = __ENV.TURNSTILE_TOKEN || "XXXX.DUMMY.TOKEN.XXXX";

const dur = (s) => `${Math.max(5, Math.round(s * DURATION_SCALE))}s`;

const signResult = new Counter("sign_status");
const signHandled = new Rate("sign_handled"); // 2xx nebo očekávané 4xx (429 rate limit, 503 READ_ONLY)

const SCENARIOS = {
  browse: {
    executor: "ramping-arrival-rate",
    exec: "browse",
    startRate: 10,
    timeUnit: "1s",
    preAllocatedVUs: 200,
    maxVUs: 2000,
    stages: [
      { target: 85, duration: dur(60) },
      { target: 85, duration: dur(480) },
      { target: 0, duration: dur(60) },
    ],
    tags: { kind: "static" },
  },
  stats: {
    executor: "constant-arrival-rate",
    exec: "stats",
    rate: 100,
    timeUnit: "1s",
    duration: dur(300),
    preAllocatedVUs: 100,
    maxVUs: 1000,
    tags: { kind: "stats" },
  },
  sign: {
    executor: "constant-arrival-rate",
    exec: "sign",
    rate: 50,
    timeUnit: "1s",
    duration: dur(300),
    preAllocatedVUs: 100,
    maxVUs: 1000,
    tags: { kind: "sign" },
  },
  "sign-burst": {
    executor: "constant-arrival-rate",
    exec: "sign",
    rate: 200,
    timeUnit: "1s",
    duration: dur(30),
    preAllocatedVUs: 300,
    maxVUs: 2000,
    tags: { kind: "sign" },
  },
};

function pick(name) {
  if (name !== "all") {
    if (!SCENARIOS[name]) throw new Error(`Neznámý SCENARIO=${name}`);
    return { [name]: SCENARIOS[name] };
  }
  const signStart = Math.round(600 * DURATION_SCALE) + 30;
  return {
    browse: SCENARIOS.browse,
    stats: SCENARIOS.stats,
    sign: { ...SCENARIOS.sign, startTime: `${signStart}s` },
    "sign-burst": { ...SCENARIOS["sign-burst"], startTime: `${signStart + Math.round(300 * DURATION_SCALE) + 30}s` },
  };
}

export const options = {
  scenarios: pick(SCENARIO),
  thresholds: {
    // §14.2: p95 z CDN pod 300 ms (statické stránky a statistiky).
    "http_req_duration{kind:static}": ["p(95)<300"],
    "http_req_duration{kind:stats}": ["p(95)<300"],
    "http_req_failed{kind:static}": ["rate<0.01"],
    "http_req_failed{kind:stats}": ["rate<0.01"],
    // Podpis: žádné 5xx kromě vědomé degradace; p95 pod 1,5 s (Turnstile + 1 transakce).
    "http_req_duration{kind:sign}": ["p(95)<1500"],
    sign_handled: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const PAGES = ["/", "/kompas", "/statistiky"];
const REGIONS = ["CZ010", "CZ020", "CZ031", "CZ064", "CZ080"];
const AGES = ["18-29", "30-44", "45-59"];

export function browse() {
  for (const p of PAGES) {
    const r = http.get(`${BASE_URL}${p}`, { tags: { kind: "static", name: p } });
    check(r, { [`${p} 200`]: (x) => x.status === 200 });
  }
  const s = http.get(`${BASE_URL}/api/stats`, { tags: { kind: "stats", name: "/api/stats" } });
  check(s, { "stats 200": (x) => x.status === 200 });
}

export function stats() {
  // Část dotazů s filtry (každá kombinace má vlastní CDN klíč).
  const q = Math.random() < 0.3 ? `?kraj=${REGIONS[Math.floor(Math.random() * REGIONS.length)]}` : "";
  const r = http.get(`${BASE_URL}/api/stats${q}`, { tags: { kind: "stats", name: "/api/stats" } });
  check(r, {
    "stats 200": (x) => x.status === 200,
    "stats cache-control": (x) => /s-maxage=60/.test(String(x.headers["Cache-Control"] || "")),
  });
}

export function sign() {
  const id = `${__VU}-${__ITER}-${Date.now()}`;
  const body = {
    name: `Zátěž ${id}`,
    email: `k6-${id}@kompas-load.example.cz`,
    showName: false,
    consent: true,
    answers: { q1: 8.5, q2: "q2-opt1", q3: "q3-opt1", q4: "q4-opt1", q5: "q5-opt1", q6: "q6-opt1", q7: ["q7-opt2"], q8: "q8-opt1" },
    region: REGIONS[__ITER % REGIONS.length],
    ageGroup: AGES[__ITER % AGES.length],
    turnstileToken: TURNSTILE_TOKEN,
  };
  const r = http.post(`${BASE_URL}/api/sign`, JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    tags: { kind: "sign", name: "/api/sign" },
    // 429 (rate limit) a 503 (READ_ONLY / „zkuste to za chvíli“) nejsou chyby testu.
    responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 429),
  });
  signResult.add(1, { status: String(r.status) });
  signHandled.add(r.status < 500 || r.status === 503);
  check(r, { "sign bez 5xx": (x) => x.status < 500 });
}
