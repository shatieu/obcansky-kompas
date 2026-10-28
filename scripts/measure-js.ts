/**
 * `pnpm measure:js [url]` – změří JS stránky (gzip) proti běžícímu `next start`
 * (výchozí http://localhost:3000/kompas). Počítá všechny <script src> kromě `noModule`
 * polyfillů (moderní prohlížeče je nestahují). Limit kompasu: 150 kB gzip (SPEC §4.6).
 */
import { gzipSync } from "node:zlib";

const url = new URL(process.argv[2] ?? "http://localhost:3000/kompas");
const LIMIT = 150 * 1024;

const html = await (await fetch(url)).text();
const tags = [...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"[^>]*>/g)].filter((m) => !/noModule/i.test(m[0]));
const srcs = [...new Set(tags.map((m) => m[1]!))];
let total = 0;
for (const src of srcs) {
  const res = await fetch(new URL(src, url));
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
  const size = gzipSync(Buffer.from(await res.arrayBuffer()), { level: 9 }).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} kB  ${src}`);
}
console.log(`celkem ${(total / 1024).toFixed(1)} kB gzip (limit ${LIMIT / 1024} kB)`);
if (url.pathname === "/kompas" && total > LIMIT) process.exit(1);
