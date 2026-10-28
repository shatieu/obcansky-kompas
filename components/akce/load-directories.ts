import { readFileSync } from "node:fs";
import path from "node:path";
import type { DirKraj, DirObec, DirPoslanec, DirSenator, DirStatic } from "@/lib/export/recipients";

/**
 * Adresáře pro /akce (jen server, při buildu). Malé soubory jdou stránce jako props
 * (oříznuté), obce (~1,3 MB) se stahují až po výběru kraje z /akce/data/obce/<kraj>.
 */
const DIR = path.join(process.cwd(), "data", "directories");
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as T;

export interface AkceDirectories {
  kraje: DirKraj[];
  poslanci: DirPoslanec[];
  senatori: DirSenator[];
  static: DirStatic;
}

export function loadAkceDirectories(): AkceDirectories {
  const kraje = read<DirKraj[]>("kraje.json").map((k) => ({
    code: k.code,
    name: k.name,
    krajsky_urad: { name: k.krajsky_urad.name, address: k.krajsky_urad.address, datova_schranka: k.krajsky_urad.datova_schranka },
  }));
  const poslanci = read<{ poslanci: DirPoslanec[] }>("poslanci.json").poslanci.map((p) => ({
    id: p.id,
    jmeno: p.jmeno,
    prijmeni: p.prijmeni,
    titul_pred: p.titul_pred,
    titul_za: p.titul_za,
    kraj_code: p.kraj_code,
    pohlavi: p.pohlavi ?? null,
    klub: p.klub ?? null,
    klub_zkratka: p.klub_zkratka,
    kandidatka: p.kandidatka ?? null,
    email: p.email,
  }));
  const senatori = read<DirSenator[]>("senatori.json").map((s) => ({
    obvod_cislo: s.obvod_cislo,
    obvod_nazev: s.obvod_nazev,
    id: s.id,
    jmeno: s.jmeno,
    jmeno_s_tituly: s.jmeno_s_tituly,
    pohlavi: s.pohlavi ?? null,
    strana: s.strana ?? null,
    email: s.email,
  }));
  const st = read<DirStatic>("static.json");
  const pick = (e: DirStatic["prezident"]) => ({
    adresat: e.adresat,
    osoba: e.osoba
      ? { jmeno: e.osoba.jmeno, prijmeni: e.osoba.prijmeni, titul_pred: e.osoba.titul_pred, titul_za: e.osoba.titul_za, pohlavi: e.osoba.pohlavi }
      : null,
    urad: e.urad,
    address: e.address,
    address_podatelna: e.address_podatelna ?? null,
    datova_schranka: e.datova_schranka,
    email: e.email,
  });
  return {
    kraje: kraje.sort((a, b) => a.name.localeCompare(b.name, "cs")),
    poslanci: poslanci.sort((a, b) => a.prijmeni.localeCompare(b.prijmeni, "cs") || a.jmeno.localeCompare(b.jmeno, "cs")),
    senatori,
    static: { ministr_kultury: pick(st.ministr_kultury), prezident: pick(st.prezident) },
  };
}

/** Obce jednoho kraje (oříznuté) – pro statickou route /akce/data/obce/<kraj>. */
export function loadObceForKraj(kraj: string): DirObec[] {
  return read<DirObec[]>("obce.json")
    .filter((o) => o.kraj_code === kraj)
    .map((o) => ({
      kod: o.kod,
      nazev: o.nazev,
      kraj_code: o.kraj_code,
      okres: o.okres,
      senatni_obvod: o.senatni_obvod,
      urad: o.urad ? { address: o.urad.address, datova_schranka: o.urad.datova_schranka, nazev: o.urad.nazev } : null,
      ...(o.casti?.length
        ? {
            casti: o.casti.map((c) => ({
              kod: c.kod,
              nazev: c.nazev,
              senatni_obvod: c.senatni_obvod,
              urad: c.urad ? { address: c.urad.address, datova_schranka: c.urad.datova_schranka, nazev: c.urad.nazev } : null,
            })),
          }
        : {}),
    }));
}

export function krajCodes(): string[] {
  return read<DirKraj[]>("kraje.json").map((k) => k.code);
}
