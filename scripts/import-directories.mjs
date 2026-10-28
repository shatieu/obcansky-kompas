#!/usr/bin/env node
// Import addressee directories for the /akce letter page (SPEC §9.2).
//
//   node scripts/import-directories.mjs                 # fetch everything, write data/directories/*.json
//   node scripts/import-directories.mjs --cache         # cache raw downloads in the OS temp dir (dev re-runs)
//   node scripts/import-directories.mjs --only=poslanci,senatori
//   node scripts/import-directories.mjs --write-fixtures # also regenerate data/directories/fixtures/
//
// Plain Node >= 22 ESM, built-ins only (fetch, zlib). No npm dependencies.
// Every contact value written comes from a fetched source; when a source fails the
// script tries one alternative, then keeps the previous full import (status "kept") or,
// without one, falls back to the fixture file (status "fixture"), recorded in meta.json.

import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'directories');
const FIX = path.join(OUT, 'fixtures');
const args = new Set(process.argv.slice(2));
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const USE_CACHE = args.has('--cache');
const WRITE_FIXTURES = args.has('--write-fixtures');
const CACHE_DIR = path.join(tmpdir(), 'obcansky-kompas-import-cache');
const UA = 'obcansky-kompas-directory-import/1.0 (+https://github.com/; open-data import)';

const SRC = {
  pspZip: 'https://www.psp.cz/eknih/cdrom/opendata/poslanci.zip',
  pspInfo: 'https://www.psp.cz/sqw/hp.sqw?k=1300',
  pspDetail: (idOsoba) => `https://www.psp.cz/sqw/detail.sqw?id=${idOsoba}`,
  senatList: 'https://www.senat.cz/senatori/index.php?lng=cz&par_2=2',
  senatDetail: (id) => `https://www.senat.cz/senatori/index.php?lng=cz&par_3=${id}`,
  senatObvod: (n) => `https://www.senat.cz/senat/volby/hledani/o_obvodu.php?kod=${n}`,
  volbyIndex: 'https://volby.gov.cz/opendata/opendata.htm',
  volbyBase: 'https://volby.gov.cz/opendata/',
  rppOvm: 'https://rpp-opendata.egon.gov.cz/odrpp/datovasada/ovm.json',
  isdsOvm: 'https://www.mojedatovaschranka.cz/sds/datafile?format=xml&service=seznam_ds_ovm',
  aresSearch: 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat',
  mkPodatelna: 'https://www.mk.gov.cz/podatelna-ministerstva-kultury-cs-2816',
  hradKontakty: 'https://www.hrad.cz/cs/kancelar-prezidenta-republiky/kontakty',
  hradPrezident: 'https://www.hrad.cz/cs/prezident-cr/soucasny-prezident-cr',
  vladaClenove: 'https://vlada.gov.cz/cz/vlada/',
  wikidataApi: 'https://www.wikidata.org/w/api.php',
  wikidataCz: 'https://www.wikidata.org/wiki/Q213',
};

// The 14 kraje: NUTS3 code, ČSÚ/RÚIAN VÚSC code. These are classification codes, not contact data.
const KRAJE = [
  { code: 'CZ010', vusc: 19, name: 'Hlavní město Praha' },
  { code: 'CZ020', vusc: 27, name: 'Středočeský kraj' },
  { code: 'CZ031', vusc: 35, name: 'Jihočeský kraj' },
  { code: 'CZ032', vusc: 43, name: 'Plzeňský kraj' },
  { code: 'CZ041', vusc: 51, name: 'Karlovarský kraj' },
  { code: 'CZ042', vusc: 60, name: 'Ústecký kraj' },
  { code: 'CZ051', vusc: 78, name: 'Liberecký kraj' },
  { code: 'CZ052', vusc: 86, name: 'Královéhradecký kraj' },
  { code: 'CZ053', vusc: 94, name: 'Pardubický kraj' },
  { code: 'CZ063', vusc: 108, name: 'Kraj Vysočina' },
  { code: 'CZ064', vusc: 116, name: 'Jihomoravský kraj' },
  { code: 'CZ071', vusc: 124, name: 'Olomoucký kraj' },
  { code: 'CZ072', vusc: 141, name: 'Zlínský kraj' },
  { code: 'CZ080', vusc: 132, name: 'Moravskoslezský kraj' },
];

const today = new Date().toISOString().slice(0, 10);
const meta = { generated_at: new Date().toISOString(), files: {}, sources: {}, warnings: [] };
const warn = (msg) => {
  meta.warnings.push(msg);
  console.warn('  ! ' + msg);
};

// ---------------------------------------------------------------- utilities

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBuf(url, { method = 'GET', body, headers = {}, retries = 2, timeout = 120_000, cache = true } = {}) {
  const key = createHash('sha1').update(method + url + (body || '')).digest('hex');
  const cfile = path.join(CACHE_DIR, key);
  if (USE_CACHE && cache && existsSync(cfile)) return readFile(cfile);
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { 'user-agent': UA, ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (USE_CACHE && cache) {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cfile, buf);
      }
      return buf;
    } catch (e) {
      lastErr = e;
      if (/HTTP 4\d\d/.test(e.message) && !/HTTP 429/.test(e.message)) break;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}
const fetchText = async (url, enc = 'utf-8', opts) => new TextDecoder(enc).decode(await fetchBuf(url, opts));
const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, 'utf-8', opts));

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

/** Minimal ZIP reader (central directory; stored + deflate). Returns Map<name, Buffer>. */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: end of central directory not found');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + csize);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, zlib.inflateRawSync(data));
    else throw new Error(`ZIP: unsupported compression method ${method} (${name})`);
  }
  return files;
}

/** RFC4180-ish CSV parser (quoted fields, "" escapes). Returns array of objects keyed by header. */
function parseCsv(text, sep = ',') {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—' };
const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
const fmtZip = (z) => {
  const d = String(z || '').replace(/\D/g, '');
  return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : String(z || '');
};
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

// ---------------------------------------------------------------- gender (pohlaví) of a person

/**
 * PSP osoby.unl `pohlavi`: "M" / "Ž" (some old rows "Z" or ISO-8859-2 "®" = Ž) -> "M" | "Z" | null.
 */
const pspPohlavi = (v) => (v === 'M' ? 'M' : ['Ž', 'Z', '®'].includes(v) ? 'Z' : null);

// Female first names (Czech + common foreign). Only used when no source states the gender.
const FEMALE_FIRST = new Set(
  (
    'Adéla Adriana Agáta Alena Alexandra Alice Alžběta Amálie Anastázie Andrea Aneta Anežka Anna Antonie Barbora Beáta Bedřiška ' +
    'Blanka Bohdana Bohumila Bohuslava Božena Dagmar Dana Daniela Darina Denisa Dita Dominika Dorota Drahomíra Eliška Ema Emílie ' +
    'Erika Eva Gabriela Hana Helena Ilona Irena Iva Ivana Iveta Jana Jarmila Jaromíra Jaroslava Jindřiška Jiřina Jitka Johana ' +
    'Jolana Josefa Judita Julie Kamila Karolína Kateřina Klára Kristina Kristýna Květa Květoslava Lada Ladislava ' +
    'Lenka Lena Libuše Lucie Ludmila Lýdie Magdalena Marcela Marie Markéta Marta Martina Michaela Milada Milena Miloslava Miluše ' +
    'Miroslava Monika Naděžda Natálie Nikola Olga Pavla Pavlína Petra Radka Radmila Renata Romana Růžena Sabina Simona Silvie ' +
    'Soňa Stanislava Světlana Šárka Taťána Tereza Valerie Vanda Vendula Věra Veronika Viktorie Vladimíra Vlasta Zdenka Zdeňka ' +
    'Zita Zora Zuzana Žaneta Žofie'
  ).split(' '),
);

/** Gender derived from the name (no source states it): -ová/-á surname or a known female first name. */
function derivePohlavi(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const female = FEMALE_FIRST.has(first) || /(ová|á)$/i.test(last);
  return female ? 'Z' : 'M';
}

/** senat.cz profile: membership roles in <dl> (člen/členka, předseda/předsedkyně …) -> "M" | "Z" | null. */
function senatPohlaviFromRoles(html) {
  const roles = [...html.matchAll(/<dt>\s*([^<]{2,40}?)\s*<\/dt>/g)].map((m) => stripTags(m[1]).toLowerCase());
  let z = 0;
  let m = 0;
  for (const r of roles) {
    if (/^(členka|(místo)?předsedkyně|ověřovatelka|zpravodajka)$/.test(r)) z++;
    else if (/^(člen|(místo)?předseda|ověřovatel|zpravodaj)$/.test(r)) m++;
  }
  if (z && !m) return 'Z';
  if (m && !z) return 'M';
  return null;
}

async function writeJson(name, data, { minify = false } = {}) {
  const file = path.join(OUT, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, (minify ? JSON.stringify(data) : JSON.stringify(data, null, 2)) + '\n');
  return (await stat(file)).size;
}

// ---------------------------------------------------------------- shared sources (lazy, memoised)

const memo = new Map();
const once = (k, fn) => {
  if (!memo.has(k)) memo.set(k, fn());
  return memo.get(k);
};

/** volby.gov.cz: list of election opendata pages, newest first. */
const volbyPages = () =>
  once('volbyPages', async () => {
    const html = await fetchText(SRC.volbyIndex);
    const links = [...html.matchAll(/href="\/opendata\/((se|ps)(\d{4})([a-z]*)\/[^"]+\.htm)"/g)].map((m) => ({
      path: m[1],
      kind: m[2],
      year: +m[3],
      suffix: m[4],
    }));
    const uniq = [...new Map(links.map((l) => [l.path, l])).values()];
    const monthOrder = { leden: 1, unor: 2, brezen: 3, duben: 4, kveten: 5, cerven: 6, cervenec: 7, srpen: 8, zari: 9, rijen: 10, listopad: 11, prosinec: 12 };
    // Within one year, by-elections named by month come before (or after) the regular one;
    // regular October elections have no suffix, treat as month 10.
    const rank = (l) => l.year * 100 + (l.suffix ? monthOrder[l.suffix] ?? 6 : 10);
    return uniq.sort((a, b) => rank(b) - rank(a));
  });

/** Download + parse the číselníky CSV zip of an election page. Returns { url, files: Map<basename, rows> }. */
async function volbyCiselniky(page) {
  const pageUrl = SRC.volbyBase + page.path;
  const html = await fetchText(pageUrl);
  const m = html.match(/href="([^"]*ciselniky[^"]*_csv\.zip)"/i);
  if (!m) throw new Error(`no číselníky CSV zip on ${pageUrl}`);
  const zipUrl = new URL(m[1], pageUrl).href;
  const files = unzip(await fetchBuf(zipUrl));
  const out = new Map();
  for (const [name, buf] of files) {
    if (!/csv_od\/[^/]+\.csv$/i.test(name)) continue;
    out.set(path.basename(name).toLowerCase(), parseCsv(buf.toString('utf8'), ','));
  }
  if (!out.size) throw new Error(`no csv_od/*.csv in ${zipUrl}`);
  return { url: zipUrl, page: pageUrl, files: out };
}

/** Latest Poslanecká sněmovna číselníky: master list of obce (cisob) + units (pscoco) + NUTS (cnumnuts). */
const psCiselniky = () =>
  once('ps', async () => {
    const pages = (await volbyPages()).filter((p) => p.kind === 'ps');
    const c = await volbyCiselniky(pages[0]);
    meta.sources.volby_ps_ciselniky = { url: c.url, page: c.page, fetched: today };
    return c;
  });

/** NUMNUTS -> {nuts, name}. */
const nutsMap = async () => {
  const c = await psCiselniky();
  return new Map(c.files.get('cnumnuts.csv').map((r) => [r.NUMNUTS, { nuts: r.NUTS, name: r.NAZEVNUTS }]));
};

/** ISDS list of OVM data boxes (gzip XML). Map<dsId, box>. */
const isds = () =>
  once('isds', async () => {
    let buf = await fetchBuf(SRC.isdsOvm, { timeout: 300_000 });
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    const xml = buf.toString('utf8');
    const g = (b, k) => {
      const m = b.match(new RegExp(`<${k}>([^<]*)</${k}>`));
      return m ? decodeEntities(m[1]).trim() : '';
    };
    const map = new Map();
    for (const b of xml.split('<box>').slice(1)) {
      const box = {
        id: g(b, 'id'),
        type: g(b, 'type'),
        name: g(b, 'tradeName'),
        ico: g(b, 'ico'),
        city: g(b, 'city'),
        district: g(b, 'district'),
        street: g(b, 'street'),
        cp: g(b, 'cp'),
        co: g(b, 'co'),
        ce: g(b, 'ce'),
        zip: g(b, 'zip'),
        fullAddress: g(b, 'fullAddress'),
        isMaster: g(b, 'isMaster') === 'true',
      };
      map.set(box.id, box);
    }
    if (map.size < 5000) throw new Error(`ISDS list suspiciously small (${map.size})`);
    meta.sources.isds_seznam_ds_ovm = { url: SRC.isdsOvm, fetched: today, boxes: map.size };
    return map;
  });

/** Postal address string from an ISDS box (as published in Seznam datových schránek OVM). */
function isdsAddress(b) {
  if (!b) return null;
  if (b.fullAddress) return b.fullAddress;
  const num = b.cp ? (b.co ? `${b.cp}/${b.co}` : b.cp) : b.ce ? `č. ev. ${b.ce}` : '';
  const line1 = b.street ? `${b.street} ${num}`.trim() : `${b.district || b.city} ${num}`.trim();
  const parts = [line1];
  if (b.street && b.district && b.district !== b.city && !b.city.startsWith(b.district)) parts.push(b.district);
  parts.push(`${fmtZip(b.zip)} ${b.city}`.trim());
  return parts.filter(Boolean).join(', ');
}

/** RPP (Registr práv a povinností) – Seznam orgánů veřejné moci. */
const rpp = () =>
  once('rpp', async () => {
    const j = await fetchJson(SRC.rppOvm, { timeout: 600_000 });
    const items = j['položky'] || j.items || [];
    if (items.length < 10000) throw new Error(`RPP ovm.json suspiciously small (${items.length})`);
    meta.sources.rpp_ovm = { url: SRC.rppOvm, fetched: today, records: items.length };
    return items;
  });
const rppDs = (o) => {
  const ds = o['datové-schránky'] || [];
  const ovm = ds.find((d) => /\/OVM$/.test(d['typ-ds'] || '')) || ds[0];
  return ovm ? ovm['identifikátor-ds'] : null;
};
const rppForm = (o) => (o['právní-forma'] || '').split('/').pop();

/** ARES batch lookup: ico[] -> Map<ico, sidlo>. */
async function aresSidla(icos) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < icos.length; i += 100) chunks.push(icos.slice(i, i + 100));
  await pool(chunks, 3, async (chunk) => {
    const body = JSON.stringify({ ico: chunk, start: 0, pocet: 100 });
    const j = JSON.parse(
      (await fetchBuf(SRC.aresSearch, { method: 'POST', body, headers: { 'content-type': 'application/json', accept: 'application/json' } })).toString('utf8'),
    );
    for (const s of j.ekonomickeSubjekty || []) out.set(s.ico, s.sidlo || {});
  });
  meta.sources.ares = { url: SRC.aresSearch, fetched: today, lookups: icos.length, found: out.size, note: 'ICO -> kód obce / městské části sídla' };
  return out;
}

// ---------------------------------------------------------------- kraje

async function importKraje() {
  const items = await rpp();
  const boxes = await isds();
  const krajeOvm = items.filter((o) => rppForm(o) === '804' && !o['ukončení']);
  const out = [];
  for (const k of KRAJE) {
    const o = krajeOvm.find((x) => norm(x['název'].cs) === norm(k.name));
    if (!o) {
      warn(`kraje: no RPP OVM (právní forma 804) for ${k.name}`);
      continue;
    }
    const ds = rppDs(o);
    const box = boxes.get(ds);
    out.push({
      code: k.code,
      vusc_kod: k.vusc,
      name: k.name,
      krajsky_urad: {
        name: box?.name || o['název'].cs,
        ico: o['ičo'] || null,
        address: isdsAddress(box),
        datova_schranka: ds,
      },
    });
  }
  if (out.length !== 14) throw new Error(`expected 14 kraje, got ${out.length}`);
  return { data: out, count: out.length, sources: [SRC.rppOvm, SRC.isdsOvm] };
}

// ---------------------------------------------------------------- poslanci

async function importPoslanci() {
  const files = unzip(await fetchBuf(SRC.pspZip));
  const dec = new TextDecoder('windows-1250');
  const unl = (name) => {
    const f = [...files.keys()].find((k) => k.toLowerCase().endsWith(name));
    if (!f) throw new Error(`poslanci.zip: missing ${name}`);
    return dec
      .decode(files.get(f))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.split('|'));
  };
  const organy = unl('organy.unl'); // id_organ|organ_id_organ|id_typ_organu|zkratka|nazev_cz|nazev_en|od|do|priorita|cl_organ_base
  const osoby = unl('osoby.unl'); // id_osoba|pred|prijmeni|jmeno|za|narozeni|pohlavi|zmena|umrti
  const poslanec = unl('poslanec.unl'); // id_poslanec|id_osoba|id_kraj|id_kandidatka|id_obdobi|web|ulice|obec|psc|email|telefon|fax|psp_telefon|facebook|foto
  const zarazeni = unl('zarazeni.unl'); // id_osoba|id_of|cl_funkce|od_o|do_o|od_f|do_f

  // Current term = Poslanecká sněmovna organ (typ 11) with empty "do".
  const terms = organy.filter((o) => o[2] === '11' && /^PSP\d+$/.test(o[3]));
  const current = terms.filter((o) => !o[7]).sort((a, b) => +b[3].slice(3) - +a[3].slice(3))[0];
  if (!current) throw new Error('PSP: no current electoral term');
  const termId = current[0];
  const organ = new Map(organy.map((o) => [o[0], o]));
  const osoba = new Map(osoby.map((o) => [o[0], o]));

  const members = zarazeni.filter((z) => z[1] === termId && z[2] === '0' && !z[4]).map((z) => z[0]);
  const clubs = new Map(organy.filter((o) => o[1] === termId && o[2] === '1').map((o) => [o[0], o]));
  const clubOf = new Map();
  for (const z of zarazeni) if (z[2] === '0' && !z[4] && clubs.has(z[1])) clubOf.set(z[0], clubs.get(z[1]));

  const krajByPsp = (id) => {
    const o = organ.get(id);
    if (!o) return null;
    const n = norm(o[4]);
    return KRAJE.find((k) => norm(k.name).includes(n) || n.includes(norm(k.name))) || null;
  };

  const rows = [];
  for (const idOsoba of new Set(members)) {
    const p = poslanec.find((x) => x[1] === idOsoba && x[4] === termId);
    const os = osoba.get(idOsoba);
    if (!p || !os) {
      warn(`poslanci: osoba ${idOsoba} without poslanec/osoby row`);
      continue;
    }
    const kraj = krajByPsp(p[2]);
    if (!kraj) warn(`poslanci: unknown volební kraj ${p[2]} for ${os[3]} ${os[2]}`);
    const club = clubOf.get(idOsoba);
    const kand = organ.get(p[3]);
    rows.push({
      id: +idOsoba,
      id_poslanec: +p[0],
      jmeno: os[3],
      prijmeni: os[2],
      titul_pred: os[1] || null,
      titul_za: os[4] || null,
      pohlavi: pspPohlavi(os[6]) ?? derivePohlavi(`${os[3]} ${os[2]}`),
      ...(pspPohlavi(os[6]) ? {} : { pohlavi_zdroj: 'odvozeno' }),
      kraj_code: kraj?.code || null,
      kraj_nazev: organ.get(p[2])?.[4] || null,
      klub: club ? club[4] : null,
      klub_zkratka: club ? club[3] : null,
      kandidatka: kand ? kand[3] : null,
      email: EMAIL_RE.test(p[9]) ? p[9] : null,
      email_source: EMAIL_RE.test(p[9]) ? 'psp_opendata' : null,
      profile_url: SRC.pspDetail(idOsoba),
    });
  }
  // Emails are not in the open data for the current term; read them from each profile page.
  let fromProfile = 0;
  await pool(rows, 4, async (r) => {
    if (r.email) return;
    try {
      const html = stripComments(await fetchText(r.profile_url, 'windows-1250'));
      const m = html.match(/<li class="mail"><a href="mailto:([^"]+)"/i) || html.match(/Kontaktní informace[\s\S]{0,400}?mailto:([^"]+)"/i);
      if (m && EMAIL_RE.test(m[1].trim())) {
        r.email = m[1].trim();
        r.email_source = 'psp_profile';
        fromProfile++;
      }
    } catch (e) {
      warn(`poslanci: profile fetch failed for ${r.id}: ${e.message}`);
    }
  });
  rows.sort((a, b) => (a.kraj_code || '').localeCompare(b.kraj_code || '') || a.prijmeni.localeCompare(b.prijmeni, 'cs'));
  if (rows.length !== 200) warn(`poslanci: expected 200, got ${rows.length}`);
  return {
    data: { term: { id: +termId, code: current[3], from: current[6] }, poslanci: rows },
    count: rows.length,
    extra: {
      with_email: rows.filter((r) => r.email).length,
      emails_from_profile_pages: fromProfile,
      pohlavi: { M: rows.filter((r) => r.pohlavi === 'M').length, Z: rows.filter((r) => r.pohlavi === 'Z').length, odvozeno: rows.filter((r) => r.pohlavi_zdroj).length },
    },
    sources: [SRC.pspZip, 'https://www.psp.cz/sqw/detail.sqw?id=<id>'],
  };
}

// ---------------------------------------------------------------- senátoři

async function importSenatori() {
  const html = stripComments(await fetchText(SRC.senatList));
  const rowRe =
    /<tr>\s*<td><a href="[^"]*o_obvodu\.php\?[^"]*kod=(\d+)">([\s\S]*?)<\/a><\/td>\s*<td><a href="[^"]*par_3=(\d+)">([\s\S]*?)<\/a><\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  const rows = [];
  for (const m of html.matchAll(rowRe)) {
    const obvodTxt = stripTags(m[2]); // "22 - Praha 10"
    const web = (m[5].match(/href="([^"]+)"/) || [])[1] || null;
    rows.push({
      obvod_cislo: +m[1],
      obvod_nazev: obvodTxt.replace(/^\d+\s*-\s*/, ''),
      id: +m[3],
      jmeno: stripTags(m[4]),
      jmeno_s_tituly: null,
      strana: stripTags(m[6]) || null,
      pohlavi: null,
      pohlavi_zdroj: null,
      email: null,
      web: web && /^https?:\/\//.test(web) ? web : null,
      profile_url: SRC.senatDetail(m[3]),
    });
  }
  if (!rows.length) throw new Error('senat.cz: no senator rows parsed');
  await pool(rows, 4, async (r) => {
    try {
      const d = stripComments(await fetchText(r.profile_url));
      const em = d.match(/<td class="odd">\s*E-mail\s*<\/td>\s*<td class="even">\s*<a href="mailto:([^"]+)"/i);
      if (em && EMAIL_RE.test(em[1].trim())) r.email = em[1].trim();
      const h1 = [...d.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((x) => stripTags(x[1])).find((t) => t && !/Senát Parlamentu/.test(t));
      if (h1) r.jmeno_s_tituly = h1;
      const g = senatPohlaviFromRoles(d);
      if (g) {
        r.pohlavi = g;
        r.pohlavi_zdroj = 'senat.cz';
      }
    } catch (e) {
      warn(`senatori: detail fetch failed for ${r.id}: ${e.message}`);
    }
    if (!r.pohlavi) {
      r.pohlavi = derivePohlavi(r.jmeno);
      r.pohlavi_zdroj = 'odvozeno';
    } else if (derivePohlavi(r.jmeno) !== r.pohlavi) {
      warn(`senatori: ${r.jmeno} – senat.cz roles say ${r.pohlavi}, name heuristic disagrees (kept senat.cz)`);
    }
  });
  rows.sort((a, b) => a.obvod_cislo - b.obvod_cislo);
  const distinct = new Set(rows.map((r) => r.obvod_cislo)).size;
  if (rows.length !== 81 || distinct !== 81) warn(`senatori: expected 81 senators in 81 obvody, got ${rows.length} / ${distinct}`);
  return {
    data: rows,
    count: rows.length,
    extra: {
      with_email: rows.filter((r) => r.email).length,
      pohlavi: { M: rows.filter((r) => r.pohlavi === 'M').length, Z: rows.filter((r) => r.pohlavi === 'Z').length, odvozeno: rows.filter((r) => r.pohlavi_zdroj === 'odvozeno').length },
    },
    sources: [SRC.senatList, 'https://www.senat.cz/senatori/index.php?lng=cz&par_3=<id>'],
  };
}

// ---------------------------------------------------------------- obce

/** Unit (obec / MČ / MO, ČSÚ volby code) -> Set<senate obvod>, from the newest senate election per obvod. */
async function senateUnitsFromVolby() {
  const pages = (await volbyPages()).filter((p) => p.kind === 'se');
  const covered = new Map(); // obvod -> page
  const unitObvody = new Map(); // unit code -> Set(obvod)
  const used = [];
  for (const page of pages) {
    if (covered.size >= 81) break;
    let c;
    try {
      c = await volbyCiselniky(page);
    } catch (e) {
      warn(`obce: senate číselník failed for ${page.path}: ${e.message}`);
      continue;
    }
    const rows = c.files.get('secoco.csv') || [];
    const fresh = new Set(rows.map((r) => r.OBVOD).filter((o) => !covered.has(o)));
    if (!fresh.size) continue;
    used.push({ election: page.path.split('/')[0], url: c.url, obvody: [...fresh].map(Number).sort((a, b) => a - b) });
    for (const r of rows) {
      if (!fresh.has(r.OBVOD)) continue;
      if (!unitObvody.has(r.OBEC)) unitObvody.set(r.OBEC, new Set());
      unitObvody.get(r.OBEC).add(+r.OBVOD);
    }
    for (const o of fresh) covered.set(o, page.path);
  }
  meta.sources.volby_senat_ciselniky = { fetched: today, used };
  if (covered.size < 81) warn(`obce: volby senate číselníky cover only ${covered.size}/81 obvody`);
  return unitObvody;
}

/** senat.cz "Popis volebního obvodu" pages: rows of units per obvod (by name). */
async function senateUnitsFromSenat() {
  const rows = [];
  await pool(
    Array.from({ length: 81 }, (_, i) => i + 1),
    4,
    async (n) => {
      try {
        const html = await fetchText(SRC.senatObvod(n));
        const tbody = (html.match(/Části územního členění[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
        for (const tr of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
          const td = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]));
          if (td.length >= 6) rows.push({ obvod: n, typ: td[0], nazev: td[1], uzemi: td[2], obec: td[3], okres: td[4], kraj: td[5] });
        }
      } catch (e) {
        warn(`obce: senat.cz obvod ${n} failed: ${e.message}`);
      }
    },
  );
  meta.sources.senat_obvody = { url: SRC.senatObvod('<n>'), fetched: today, rows: rows.length };
  return rows;
}

async function importObce() {
  const ps = await psCiselniky();
  const nuts = await nutsMap();
  const cisob = ps.files.get('cisob.csv'); // OBEC_PREZ,NAZEVOBCE  (municipalities)
  const pscoco = ps.files.get('pscoco.csv'); // units incl. MČ/MO, OBEC_PREZ = parent municipality
  if (!cisob?.length || !pscoco?.length) throw new Error('PS číselník missing cisob/pscoco');

  const obce = new Map();
  for (const r of cisob) obce.set(r.OBEC_PREZ, { kod: +r.OBEC_PREZ, nazev: r.NAZEVOBCE, kraj_code: null, okres: null, okres_nuts: null, senatni_obvod: [], urad: null, casti: [] });
  const units = new Map();
  for (const r of pscoco) {
    const o = obce.get(r.OBEC_PREZ);
    if (!o) continue;
    const kraj = nuts.get(r.KRAJ);
    const okres = nuts.get(r.OKRES);
    o.kraj_code ??= kraj?.nuts || null;
    o.okres ??= okres?.name || null;
    o.okres_nuts ??= okres?.nuts || null;
    const u = { kod: +r.OBEC, nazev: r.NAZEVOBCE, parent: r.OBEC_PREZ, senatni_obvod: new Set(), urad: null };
    units.set(r.OBEC, u);
  }

  // cisob also lists the 4 vojenské újezdy (no municipal government, no voters) – they have no pscoco rows.
  const skipped = [...obce.values()].filter((o) => !o.kraj_code);
  for (const o of skipped) obce.delete(String(o.kod));
  if (skipped.length) console.log(`   skipped ${skipped.length} cisob entries without voting units (vojenské újezdy): ${skipped.map((o) => o.nazev).join(', ')}`);

  // Senate districts: volby.gov.cz (by code) first, senat.cz (by name) to fill gaps and cross-check.
  const byVolby = await senateUnitsFromVolby();
  for (const [code, set] of byVolby) {
    const u = units.get(code) || (obce.has(code) ? null : null);
    if (u) for (const s of set) u.senatni_obvod.add(s);
  }
  const senatRows = await senateUnitsFromSenat();
  const senatIdx = new Map();
  for (const r of senatRows) {
    for (const key of [`${norm(r.nazev)}|${norm(r.okres)}`, `${norm(r.nazev)}|${norm(r.obec)}`]) {
      if (!senatIdx.has(key)) senatIdx.set(key, new Set());
      senatIdx.get(key).add(r.obvod);
    }
  }
  let filledFromSenat = 0;
  let mismatch = 0;
  const unresolved = [];
  for (const u of units.values()) {
    const parent = obce.get(u.parent);
    const keys = [`${norm(u.nazev)}|${norm(parent.okres)}`, `${norm(u.nazev)}|${norm(parent.nazev)}`];
    if (parent.okres === 'Praha') keys.push(`${norm(u.nazev)}|${norm('Hlavní město Praha')}`);
    const fromSenat = keys.map((k) => senatIdx.get(k)).find(Boolean);
    if (u.senatni_obvod.size) {
      if (fromSenat && ![...u.senatni_obvod].some((s) => fromSenat.has(s))) {
        mismatch++;
        // Sources disagree (typically a boundary change not yet applied to the sitting senator):
        // keep both so the user can pick; never silently drop one.
        warn(`obce: ${u.kod} ${u.nazev}: volby.gov.cz obvod ${[...u.senatni_obvod]} vs senat.cz ${[...fromSenat]} – both kept`);
        for (const s of fromSenat) u.senatni_obvod.add(s);
      }
    } else if (fromSenat) {
      for (const s of fromSenat) u.senatni_obvod.add(s);
      filledFromSenat++;
      console.log(`   obvod from senat.cz: ${u.kod} ${u.nazev} -> ${[...fromSenat]}`);
    } else unresolved.push(`${u.kod} ${u.nazev}`);
  }
  if (unresolved.length) warn(`obce: ${unresolved.length} units without senate obvod: ${unresolved.slice(0, 20).join(', ')}`);

  // Offices: RPP OVM (obec = právní forma 801, Praha MČ = 811, other MČ/MO = internal units with parent OVM).
  const items = await rpp();
  const boxes = await isds();
  const active = items.filter((o) => !o['ukončení']);
  const muni = active.filter((o) => ['801', '811'].includes(rppForm(o)) && o['ičo']);
  const sidla = await aresSidla([...new Set(muni.map((o) => o['ičo']))]);
  const urad = (o) => {
    const ds = rppDs(o);
    const box = boxes.get(ds);
    return { nazev: o['název'].cs, ico: o['ičo'] || null, address: isdsAddress(box), datova_schranka: ds };
  };
  const isPartName = (n) => /^(Městská část|Městský obvod|Úřad městského obvodu|Úřad městské části)\b/i.test(n);
  const icoToObec = new Map();
  let officeConflicts = 0;
  for (const o of muni) {
    const s = sidla.get(o['ičo']);
    if (!s) continue;
    const name = o['název'].cs;
    if (isPartName(name) || rppForm(o) === '811') {
      const u = units.get(String(s.kodMestskeCastiObvodu));
      if (u && !u.urad) u.urad = urad(o);
      else if (!u) warn(`obce: no unit for ${name} (MČ/MO kód ${s.kodMestskeCastiObvodu})`);
      continue;
    }
    const ob = obce.get(String(s.kodObce));
    if (!ob) continue; // e.g. vojenský újezd
    icoToObec.set(o['ičo'], ob);
    if (ob.urad) {
      officeConflicts++;
      // prefer the body named as a municipality
      if (!/^(Obec|Město|Městys|Statutární město|Hlavní město)\b/i.test(ob.urad.nazev) && /^(Obec|Město|Městys|Statutární město|Hlavní město)\b/i.test(name)) ob.urad = urad(o);
      continue;
    }
    ob.urad = urad(o);
  }
  // Fallback: ARES seat lies in another municipality (office hosted by a neighbour). Match by name
  // among municipality OVMs not yet assigned; accept only a unique candidate.
  const assigned = new Set([...obce.values()].map((o) => o.urad?.ico).filter(Boolean));
  const muniName = (n) => norm(n.replace(/^(Obec|Město|Městys|Statutární město)\s+/i, ''));
  let byNameFallback = 0;
  for (const ob of obce.values()) {
    if (ob.urad) continue;
    const cands = muni.filter((o) => !assigned.has(o['ičo']) && !isPartName(o['název'].cs) && rppForm(o) === '801' && muniName(o['název'].cs) === norm(ob.nazev));
    if (cands.length === 1) {
      ob.urad = urad(cands[0]);
      assigned.add(cands[0]['ičo']);
      byNameFallback++;
    }
  }

  // Praha: the city itself is a kraj (právní forma 804) and an obec.
  const praha = active.find((o) => rppForm(o) === '804' && norm(o['název'].cs) === norm('Hlavní město Praha'));
  const prahaObec = [...obce.values()].find((o) => o.nazev === 'Praha');
  if (praha && prahaObec && !prahaObec.urad) prahaObec.urad = urad(praha);

  // MČ/MO without own IČO (internal units of statutory cities, parent = city OVM).
  const unmatchedParts = [];
  for (const o of active) {
    if (!o['nadřízený-ovm'] || !isPartName(o['název'].cs)) continue;
    const parentIco = String(o['nadřízený-ovm']).split('/').pop();
    const city = icoToObec.get(parentIco);
    if (!city) {
      unmatchedParts.push(o['název'].cs);
      continue;
    }
    const stripped = norm(o['název'].cs.replace(/^(Městská část|Městský obvod|Úřad městského obvodu|Úřad městské části)\s+/i, ''));
    const cands = [...units.values()].filter((u) => u.parent === String(city.kod));
    const hit =
      cands.find((u) => norm(u.nazev) === stripped) ||
      cands.find((u) => norm(u.nazev) === norm(city.nazev) + stripped) ||
      cands.find((u) => norm(u.nazev).endsWith(stripped) && stripped.length > 3);
    if (hit && !hit.urad) hit.urad = urad(o);
    else if (!hit) unmatchedParts.push(o['název'].cs);
  }
  if (unmatchedParts.length) warn(`obce: ${unmatchedParts.length} MČ/MO offices not matched to a volby unit: ${unmatchedParts.slice(0, 15).join(', ')}`);

  // Assemble.
  for (const u of units.values()) {
    const ob = obce.get(u.parent);
    for (const s of u.senatni_obvod) if (!ob.senatni_obvod.includes(s)) ob.senatni_obvod.push(s);
    if (String(u.kod) !== u.parent) {
      ob.casti.push({ kod: u.kod, nazev: u.nazev, senatni_obvod: [...u.senatni_obvod].sort((a, b) => a - b), urad: u.urad ? { address: u.urad.address, datova_schranka: u.urad.datova_schranka, nazev: u.urad.nazev } : null });
    }
  }
  const list = [...obce.values()]
    .map((o) => ({
      kod: o.kod,
      nazev: o.nazev,
      kraj_code: o.kraj_code,
      okres: o.okres,
      senatni_obvod: o.senatni_obvod.sort((a, b) => a - b),
      urad: o.urad ? { address: o.urad.address, datova_schranka: o.urad.datova_schranka, nazev: o.urad.nazev } : null,
      ...(o.casti.length ? { casti: o.casti.sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs')) } : {}),
    }))
    .sort((a, b) => a.kraj_code.localeCompare(b.kraj_code) || a.nazev.localeCompare(b.nazev, 'cs') || a.kod - b.kod);

  const noUrad = list.filter((o) => !o.urad);
  const noSo = list.filter((o) => !o.senatni_obvod.length);
  if (noUrad.length) warn(`obce: ${noUrad.length} obce without office: ${noUrad.slice(0, 15).map((o) => `${o.kod} ${o.nazev}`).join(', ')}`);
  if (noSo.length) warn(`obce: ${noSo.length} obce without senate obvod: ${noSo.slice(0, 15).map((o) => `${o.kod} ${o.nazev}`).join(', ')}`);
  return {
    data: list,
    count: list.length,
    extra: {
      units_total: units.size,
      with_office: list.length - noUrad.length,
      with_senate_obvod: list.length - noSo.length,
      split_cities: list.filter((o) => o.casti).length,
      multi_obvod_obce: list.filter((o) => o.senatni_obvod.length > 1).length,
      units_filled_from_senat_cz: filledFromSenat,
      units_volby_vs_senat_cz_mismatch: mismatch,
      units_unresolved_obvod: unresolved.length,
      duplicate_office_candidates: officeConflicts,
      offices_matched_by_name: byNameFallback,
    },
    sources: [ps.url, 'volby.gov.cz senate číselníky (see sources.volby_senat_ciselniky)', SRC.senatObvod('<n>'), SRC.rppOvm, SRC.isdsOvm, SRC.aresSearch],
  };
}

// ---------------------------------------------------------------- static (ministr kultury, prezident)

/** "Oto Klempíř" -> { jmeno, prijmeni } (first token = first name, rest = surname). */
const splitName = (full) => {
  const parts = String(full).trim().split(/\s+/);
  return { jmeno: parts[0], prijmeni: parts.slice(1).join(' ') };
};

/**
 * Current minister of culture from the list of government members on vlada.gov.cz
 * (name + office title; the title "ministr" / "ministryně" gives the gender).
 */
async function ministrKulturyOsoba() {
  const html = stripComments(await fetchText(SRC.vladaClenove));
  for (const m of html.matchAll(/<h3>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>\s*<p>([\s\S]*?)<\/p>/g)) {
    const funkce = stripTags(m[3]).toLowerCase();
    if (!/^ministr(yně)? kultury$/.test(funkce)) continue;
    const name = stripTags(m[2]);
    return {
      ...splitName(name),
      titul_pred: null,
      titul_za: null,
      pohlavi: funkce.startsWith('ministryně') ? 'Z' : 'M',
      zdroj: SRC.vladaClenove,
      zdroj_detail: new URL(m[1], SRC.vladaClenove).toString(),
      overeno: today,
    };
  }
  throw new Error('vlada.gov.cz: "ministr(yně) kultury" not found in the list of government members');
}

/**
 * Current president. hrad.cz answers HTTP 403 to automated requests, so the fallback is
 * Wikidata (Q213 Czech Republic, P35 head of state with no end date; P21 sex).
 */
async function prezidentOsoba(notes) {
  try {
    const html = await fetchText(SRC.hradPrezident, 'utf-8', { retries: 0 });
    // Accept only the real page (not a bot challenge): <h1> = "Prezident(ka) republiky <Jméno Příjmení>".
    const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((x) => stripTags(x[1]));
    const m = h1
      .map((t) => t.match(/^(Prezidentka|Prezident) (?:České )?republiky,? ([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\p{Ll}]+ [A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\p{Ll}]+)$/u))
      .find(Boolean);
    if (m) return { ...splitName(m[2]), titul_pred: null, titul_za: null, pohlavi: m[1] === 'Prezidentka' ? 'Z' : 'M', zdroj: SRC.hradPrezident, overeno: today };
    notes.push('hrad.cz: stránka nedala jméno prezidenta (ochrana proti robotům); jméno a pohlaví prezidenta z Wikidat');
  } catch (e) {
    notes.push(`hrad.cz nelze automaticky stáhnout (${e.message}); jméno a pohlaví prezidenta z Wikidat`);
  }
  const api = (q) => fetchJson(`${SRC.wikidataApi}?${new URLSearchParams({ format: 'json', ...q })}`, { cache: false });
  const claims = (await api({ action: 'wbgetclaims', entity: 'Q213', property: 'P35' })).claims?.P35 ?? [];
  const current = claims.filter((c) => c.rank !== 'deprecated' && !c.qualifiers?.P582 && c.mainsnak?.datavalue);
  const pick = current.find((c) => c.rank === 'preferred') ?? current[0];
  if (!pick) throw new Error('Wikidata: no current head of state (Q213 P35)');
  const qid = pick.mainsnak.datavalue.value.id;
  const ent = (await api({ action: 'wbgetentities', ids: qid, props: 'labels|claims', languages: 'cs' })).entities[qid];
  const sex = ent.claims?.P21?.[0]?.mainsnak?.datavalue?.value?.id;
  const pohlavi = sex === 'Q6581072' ? 'Z' : sex === 'Q6581097' ? 'M' : null;
  if (!pohlavi) throw new Error(`Wikidata: ${qid} has no usable sex (P21)`);
  const since = pick.qualifiers?.P580?.[0]?.datavalue?.value?.time?.slice(1, 11) ?? null;
  return {
    ...splitName(ent.labels.cs.value),
    titul_pred: null,
    titul_za: null,
    pohlavi,
    zdroj: `https://www.wikidata.org/wiki/${qid}`,
    zdroj_detail: `${SRC.wikidataCz} (P35 hlava státu${since ? `, od ${since}` : ''})`,
    overeno: today,
  };
}

async function importStatic() {
  const boxes = await isds();
  const items = await rpp();
  const byName = (n) => items.find((o) => norm(o['název'].cs) === norm(n) && !o['ukončení']);
  const entry = (rppName) => {
    const o = byName(rppName);
    if (!o) throw new Error(`RPP: ${rppName} not found`);
    const ds = rppDs(o);
    return { o, ds, box: boxes.get(ds) };
  };
  const out = {};

  // Ministr kultury – Ministerstvo kultury
  {
    const { o, ds, box } = entry('Ministerstvo kultury');
    const rec = {
      adresat: 'Ministr kultury',
      urad: o['název'].cs,
      ico: o['ičo'] || null,
      address: isdsAddress(box),
      address_source: SRC.isdsOvm,
      datova_schranka: ds,
      datova_schranka_source: SRC.rppOvm,
      email: null,
      email_source: null,
      web_form: null,
      web: null,
      notes: [],
    };
    try {
      const html = await fetchText(SRC.mkPodatelna);
      const text = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, ''));
      const m = text.match(/E-mail:\s*([\w.+-]+)\s*\(zavináč\)\s*([\w.-]+)/i) || text.match(/E-mail:\s*([\w.+-]+)@([\w.-]+)/i);
      if (m) {
        rec.email = `${m[1]}@${m[2]}`;
        rec.email_source = SRC.mkPodatelna;
      }
      const dsPage = (text.match(/ID datové schránky:\s*(\w{7})/i) || [])[1];
      if (dsPage && dsPage !== ds) rec.notes.push(`mk.gov.cz uvádí datovou schránku ${dsPage}, RPP ${ds}`);
      const addr = text.match(/Ministerstvo kultury,\s*(Maltézské[^.]*?\d{3}\s?\d{2}\s+Praha\s+\d+)/);
      if (addr) {
        rec.address_podatelna = addr[1].trim();
        rec.address_podatelna_source = SRC.mkPodatelna;
      }
      rec.web = 'https://www.mk.gov.cz/';
    } catch (e) {
      rec.notes.push(`mk.gov.cz podatelna page failed: ${e.message}`);
      warn(`static: mk.gov.cz failed: ${e.message}`);
    }
    try {
      rec.osoba = await ministrKulturyOsoba();
    } catch (e) {
      rec.osoba = PREV_STATIC?.ministr_kultury?.osoba ?? null;
      warn(`static: minister of culture not imported (${e.message})${rec.osoba ? ' – kept previous value' : ''}`);
    }
    out.ministr_kultury = rec;
  }

  // Prezident republiky – Kancelář prezidenta republiky
  {
    const { o, ds, box } = entry('Kancelář prezidenta republiky');
    const rec = {
      adresat: 'Prezident republiky',
      urad: o['název'].cs,
      ico: o['ičo'] || null,
      address: isdsAddress(box),
      address_source: SRC.isdsOvm,
      datova_schranka: ds,
      datova_schranka_source: SRC.rppOvm,
      email: null,
      email_source: null,
      web_form: null,
      web: null,
      notes: [],
    };
    try {
      const html = await fetchText(SRC.hradKontakty, 'utf-8', { retries: 0 });
      const mails = [...new Set(html.match(/[\w.+-]+@hrad\.cz/g) || [])];
      if (mails.length) {
        rec.email = mails[0];
        rec.email_source = SRC.hradKontakty;
        rec.notes.push(`e-maily na stránce: ${mails.join(', ')}`);
      }
      rec.web = 'https://www.hrad.cz/';
    } catch (e) {
      rec.notes.push(`hrad.cz kontakty nelze automaticky stáhnout (${e.message}); e-mail / webový formulář doplnit ručně z ${SRC.hradKontakty}`);
      warn(`static: hrad.cz failed: ${e.message} (email/web form left null)`);
    }
    try {
      rec.osoba = await prezidentOsoba(rec.notes);
    } catch (e) {
      rec.osoba = PREV_STATIC?.prezident?.osoba ?? null;
      warn(`static: president not imported (${e.message})${rec.osoba ? ' – kept previous value' : ''}`);
    }
    out.prezident = rec;
  }
  return {
    data: out,
    count: Object.keys(out).length,
    sources: [SRC.isdsOvm, SRC.rppOvm, SRC.mkPodatelna, SRC.hradKontakty, SRC.vladaClenove, SRC.hradPrezident, SRC.wikidataCz],
  };
}

// ---------------------------------------------------------------- fixtures

function fixtureOf(name, data) {
  switch (name) {
    case 'kraje.json':
      return data.filter((k) => ['CZ010', 'CZ064', 'CZ080'].includes(k.code));
    case 'poslanci.json': {
      const pick = [];
      for (const kc of ['CZ010', 'CZ064', 'CZ080']) pick.push(...data.poslanci.filter((p) => p.kraj_code === kc).slice(0, 2));
      return { ...data, poslanci: pick };
    }
    case 'senatori.json':
      return data.filter((s) => [22, 26, 27, 59, 70].includes(s.obvod_cislo));
    case 'obce.json': {
      const want = ['Praha', 'Brno', 'Ostrava', 'Blatec', 'Opava'];
      return data.filter((o) => want.includes(o.nazev) && ['CZ010', 'CZ064', 'CZ080', 'CZ071'].includes(o.kraj_code));
    }
    default:
      return data;
  }
}

// ---------------------------------------------------------------- main

const JOBS = [
  ['kraje', 'kraje.json', importKraje, {}],
  ['poslanci', 'poslanci.json', importPoslanci, {}],
  ['senatori', 'senatori.json', importSenatori, {}],
  ['obce', 'obce.json', importObce, { minify: true }],
  ['static', 'static.json', importStatic, {}],
];

let PREV_STATIC = null;

async function main() {
  await mkdir(OUT, { recursive: true });
  if (existsSync(path.join(OUT, 'static.json'))) PREV_STATIC = JSON.parse(await readFile(path.join(OUT, 'static.json'), 'utf8'));
  const prevMeta = existsSync(path.join(OUT, 'meta.json')) ? JSON.parse(await readFile(path.join(OUT, 'meta.json'), 'utf8')) : null;
  if (prevMeta && ONLY.length) {
    meta.files = prevMeta.files || {};
    meta.sources = prevMeta.sources || {};
  }
  for (const [key, file, fn, opts] of JOBS) {
    if (ONLY.length && !ONLY.includes(key)) continue;
    console.log(`\n== ${file}`);
    const t0 = Date.now();
    try {
      const r = await fn();
      let data = r.data;
      let size = await writeJson(file, data, opts);
      // Split per kraj if obce grows beyond ~3 MB.
      if (file === 'obce.json' && size > 3_000_000) {
        for (const k of KRAJE) await writeJson(`obce/${k.code}.json`, data.filter((o) => o.kraj_code === k.code), opts);
        warn('obce.json > 3 MB: also written per kraj to obce/<kraj_code>.json');
      }
      if (WRITE_FIXTURES) await writeJson(path.join('fixtures', file), fixtureOf(file, data));
      meta.files[file] = { status: 'ok', fetched: today, count: r.count, bytes: size, sources: r.sources, ...(r.extra ? { extra: r.extra } : {}) };
      console.log(`   ok: ${r.count} records, ${(size / 1024).toFixed(1)} kB, ${((Date.now() - t0) / 1000).toFixed(1)} s`, r.extra ? JSON.stringify(r.extra) : '');
    } catch (e) {
      console.error(`   FAILED: ${e.stack || e.message}`);
      const fx = path.join(FIX, file);
      const prev = meta.files[file] ?? prevMeta?.files?.[file];
      if (existsSync(path.join(OUT, file)) && prev?.status === 'ok') {
        // A previous full import is better than the small fixture: keep it.
        meta.files[file] = { ...prev, status: 'kept', error: String(e.message) };
        warn(`${file}: import failed, kept previous data from ${prev.fetched} (${e.message})`);
      } else if (existsSync(fx)) {
        await copyFile(fx, path.join(OUT, file));
        meta.files[file] = { status: 'fixture', error: String(e.message), fetched: null, bytes: (await stat(fx)).size };
        warn(`${file}: import failed, copied fixture (${e.message})`);
      } else {
        meta.files[file] = { status: 'failed', error: String(e.message) };
        warn(`${file}: import failed and no fixture available (${e.message})`);
      }
    }
  }
  await writeJson('meta.json', meta);

  console.log('\n== summary');
  for (const [f, m] of Object.entries(meta.files)) console.log(`   ${f.padEnd(14)} ${m.status.padEnd(8)} ${String(m.count ?? '-').padStart(5)} records  ${m.bytes ? (m.bytes / 1024).toFixed(1) + ' kB' : ''}`);
  const expect = { 'kraje.json': 14, 'poslanci.json': 200, 'senatori.json': 81 };
  for (const [f, n] of Object.entries(expect)) if (meta.files[f]?.status === 'ok' && meta.files[f].count !== n) console.log(`   ! ${f}: expected ${n}, got ${meta.files[f].count}`);
  const ob = meta.files['obce.json'];
  if (ob?.status === 'ok' && (ob.count < 6200 || ob.count > 6300)) console.log(`   ! obce.json: expected ~6250, got ${ob.count}`);
  if (meta.warnings.length) console.log(`   ${meta.warnings.length} warning(s) – see meta.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
