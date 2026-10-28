import type { AddresseeType } from "@/lib/letters";
import { personName, slugify, splitAddress } from "./text";

/**
 * Adresáti dopisů (SPEC §9.2) z data/directories/*.json → jednotný tvar pro UI a PDF.
 * Čisté funkce, bez přístupu k síti nebo souborům.
 */

/* ------------------------------------------------- tvary adresářů (výřez) */

export interface DirPoslanec {
  id: number;
  jmeno: string;
  prijmeni: string;
  titul_pred: string | null;
  titul_za: string | null;
  kraj_code: string;
  klub_zkratka: string | null;
  kandidatka?: string | null;
  email: string | null;
}

export interface DirSenator {
  obvod_cislo: number;
  obvod_nazev: string;
  id: number;
  jmeno: string;
  jmeno_s_tituly: string;
  strana?: string | null;
  email: string | null;
}

export interface DirOffice {
  address: string | null;
  datova_schranka: string | null;
  nazev: string | null;
}

export interface DirKraj {
  code: string;
  name: string;
  krajsky_urad: { name: string; address: string | null; datova_schranka: string | null };
}

export interface DirObecCast {
  kod: number;
  nazev: string;
  senatni_obvod: number[];
  urad: DirOffice | null;
}

export interface DirObec {
  kod: number;
  nazev: string;
  kraj_code: string;
  okres: string;
  senatni_obvod: number[];
  urad: DirOffice | null;
  casti?: DirObecCast[];
}

export interface DirStaticEntry {
  adresat: string;
  urad: string;
  address: string | null;
  address_podatelna?: string | null;
  datova_schranka: string | null;
  email: string | null;
}

export interface DirStatic {
  ministr_kultury: DirStaticEntry;
  prezident: DirStaticEntry;
}

/* --------------------------------------------------------------- adresát */

export interface Recipient {
  /** Stabilní klíč (např. „poslanec:6254“). */
  key: string;
  type: AddresseeType;
  /** Jméno pro UI. */
  name: string;
  /** Doplňující řádek pro UI (klub, obvod, úřad). */
  detail: string | null;
  /** Řádky adresy do okénka obálky (včetně jména). */
  postal: string[];
  email: string | null;
  /** ID datové schránky – jen u úřadů. */
  dataBox: string | null;
  /** Základ názvu souboru (bez přípony). */
  fileBase: string;
}

/** Texty adres, které nejsou v adresářích (ui-akce.yaml → akce.postal). */
export interface PostalTexts {
  poslanec_org: string;
  poslanec_address: string;
  senator_org: string;
  senator_address: string;
  kraj_recipient: string;
  obec_recipient: string;
  senator_detail: string;
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function poslanecRecipient(p: DirPoslanec, t: PostalTexts): Recipient {
  const name = personName(p);
  return {
    key: `poslanec:${p.id}`,
    type: "poslanec",
    name,
    detail: p.klub_zkratka ?? p.kandidatka ?? null,
    postal: [name, t.poslanec_org, ...splitAddress(t.poslanec_address)],
    email: p.email,
    dataBox: null,
    fileBase: `dopis-${slugify(`${p.prijmeni} ${p.jmeno}`)}`,
  };
}

export function senatorRecipient(s: DirSenator, t: PostalTexts): Recipient {
  const name = s.jmeno_s_tituly || s.jmeno;
  return {
    key: `senator:${s.id}`,
    type: "senator",
    name,
    detail: fill(t.senator_detail, { n: s.obvod_cislo, name: s.obvod_nazev }),
    postal: [name, t.senator_org, ...splitAddress(t.senator_address)],
    email: s.email,
    dataBox: null,
    fileBase: `dopis-senator-${slugify(s.jmeno)}`,
  };
}

export function krajRecipient(k: DirKraj, t: PostalTexts): Recipient {
  const office = k.krajsky_urad;
  return {
    key: `kraj:${k.code}`,
    type: "kraj",
    name: k.name,
    detail: office.name,
    postal: [t.kraj_recipient, office.name, ...splitAddress(office.address)],
    email: null,
    dataBox: office.datova_schranka,
    fileBase: `dopis-kraj-${slugify(k.name)}`,
  };
}

/** Obec (nebo městská část, když je vybraná a má vlastní úřad). */
export function obecRecipient(o: { kod: number; nazev: string; urad: DirOffice | null }, t: PostalTexts): Recipient {
  const officeName = o.urad?.nazev ?? o.nazev;
  return {
    key: `obec:${o.kod}`,
    type: "obec",
    name: o.nazev,
    detail: officeName,
    postal: [t.obec_recipient, officeName, ...splitAddress(o.urad?.address)],
    email: null,
    dataBox: o.urad?.datova_schranka ?? null,
    fileBase: `dopis-obec-${slugify(o.nazev)}`,
  };
}

export function staticRecipient(type: "ministr-kultury" | "prezident", s: DirStaticEntry): Recipient {
  return {
    key: type,
    type,
    name: s.adresat,
    detail: s.urad,
    postal: [s.adresat, s.urad, ...splitAddress(s.address_podatelna ?? s.address)],
    email: s.email,
    dataBox: s.datova_schranka,
    fileBase: `dopis-${type}`,
  };
}

/* ------------------------------------------------------- senátní obvod */

export interface SenateChoice {
  /** Obvody, ze kterých je třeba vybrat (prázdné = nic k výběru). */
  obvody: number[];
  /** Městské části / obvody, ze kterých je třeba nejdřív vybrat. */
  casti: DirObecCast[];
}

/**
 * Co se musí uživatele zeptat, aby se našel senátní obvod (README data/directories):
 * jeden obvod → hotovo; víc obvodů a obec má části → vybrat část; část s víc obvody → vybrat obvod.
 */
export function senateChoice(obec: DirObec, castKod: number | null): SenateChoice {
  if (obec.senatni_obvod.length <= 1) return { obvody: obec.senatni_obvod, casti: [] };
  const casti = obec.casti ?? [];
  if (casti.length === 0) return { obvody: obec.senatni_obvod, casti: [] };
  const cast = castKod === null ? undefined : casti.find((c) => c.kod === castKod);
  if (!cast) return { obvody: [], casti };
  return { obvody: cast.senatni_obvod, casti };
}

/** Výsledný obvod, nebo null, když je ještě potřeba volba. */
export function resolveObvod(obec: DirObec, castKod: number | null, obvodPick: number | null): number | null {
  const { obvody } = senateChoice(obec, castKod);
  if (obvody.length === 1) return obvody[0]!;
  if (obvodPick !== null && obvody.includes(obvodPick)) return obvodPick;
  return null;
}
