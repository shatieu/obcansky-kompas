/**
 * Čisté pomocné funkce pro exporty (PDF, DOCX, ZIP). Bez závislostí, testované v text.test.ts.
 */

/** Šířka textu v libovolných jednotkách (u PDF body při dané velikosti písma). */
export type Measure = (text: string) => number;

/** Rozdělí jeden odstavec (bez \n) na řádky, které se vejdou do `maxWidth`. */
function wrapLine(line: string, maxWidth: number, measure: Measure): string[] {
  const words = line.split(/ +/).filter(Boolean);
  if (words.length === 0) return [""];
  const out: string[] = [];
  let cur = "";
  const pushLongWord = (word: string) => {
    // Slovo delší než řádek (URL, ID) – rozdělit po znacích.
    let chunk = "";
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > maxWidth) {
        out.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    return chunk;
  };
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      cur = candidate;
      continue;
    }
    if (cur) out.push(cur);
    cur = measure(word) <= maxWidth ? word : pushLongWord(word);
  }
  if (cur) out.push(cur);
  return out;
}

/** Zalomí text do řádků; `\n` je vynucený konec řádku. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  return text.split("\n").flatMap((l) => wrapLine(l.trim(), maxWidth, measure));
}

/** Odstavce oddělené prázdným řádkem. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** „Mgr. Jana Nováková“ → „mgr-jana-novakova“ (pro názvy souborů). */
export function slugify(s: string, max = 60): string {
  const slug = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "soubor";
}

/** Zajistí jedinečné názvy: a.pdf, a.pdf → a.pdf, a-2.pdf. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
  });
}

/** „Ulice 1, Část, 110 00 Praha 1“ → řádky adresy. */
export function splitAddress(address: string | null | undefined): string[] {
  if (!address) return [];
  return address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 28. 10. 2026 (s nezlomitelnými mezerami). */
export function formatDateCz(d: Date): string {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** Jméno s tituly: „prof. MUDr. Věra Adámková, CSc.“ */
export function personName(p: { titul_pred?: string | null; jmeno: string; prijmeni?: string | null; titul_za?: string | null }): string {
  const core = [p.titul_pred, p.jmeno, p.prijmeni].filter((x): x is string => Boolean(x && x.trim())).join(" ");
  return p.titul_za ? `${core}, ${p.titul_za}` : core;
}

/**
 * mailto: odkaz. Mezery jako %20 (ne +), aby je pošťáci zobrazili správně.
 * Dlouhé tělo některé klienty ořízne; text je proto i ke zkopírování.
 */
export function mailtoHref(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${to}?subject=${enc(subject)}&body=${enc(body)}`;
}
