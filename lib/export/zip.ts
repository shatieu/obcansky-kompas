import { zipSync } from "fflate";
import { uniqueNames } from "./text";

/** ZIP všech PDF dopisů (SPEC §9.2). PDF už jsou komprimovaná → ukládají se bez komprese. */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function buildZip(entries: ZipEntry[], mtime: Date = new Date()): Uint8Array {
  const names = uniqueNames(entries.map((e) => e.name));
  const files: Record<string, [Uint8Array, { level: 0; mtime: Date }]> = {};
  entries.forEach((e, i) => {
    files[names[i]!] = [e.data, { level: 0, mtime }];
  });
  return zipSync(files);
}
