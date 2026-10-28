/**
 * Nápověda „už stojím v davu“ pro klienta: necitlivá cookie `ok_in_crowd=1` (NE httpOnly), aby
 * tlačítka „Připojit se“ mohla hned po hydrataci ukázat „Upravit panáčka“ bez dalšího požadavku
 * (blok postoje je na /kompas s rozpočtem JS). Nic nedokládá – vlastnictví pořád jen httpOnly
 * `ok_owner`; při podvržení uvidí člověk jen jiný popisek a /demonstrace/pripojit ho stejně
 * pustí jen k vlastnímu panáčkovi. Nastaví se po připojení/úpravě a při GET /me (/me/detail)
 * s nalezeným panáčkem, smaže se, když /me panáčka nenajde. Bez importů – jde i do klienta.
 */
export const IN_CROWD_COOKIE = "ok_in_crowd";
const MAX_AGE = 365 * 24 * 3600;

/** Hodnota hlavičky Set-Cookie (nastavit / smazat). */
export function inCrowdSetCookie(on: boolean, secure: boolean): string {
  return `${IN_CROWD_COOKIE}=${on ? "1" : ""}; Path=/; Max-Age=${on ? MAX_AGE : 0}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Přidá Set-Cookie k odpovědi a vrátí ji. */
export function withInCrowd<T extends Response>(res: T, on: boolean, req?: { url?: string }): T {
  const secure = req?.url ? new URL(req.url).protocol !== "http:" : true;
  res.headers.append("set-cookie", inCrowdSetCookie(on, secure));
  return res;
}

/** V prohlížeči: má návštěvník nápovědu „v davu“? (Na serveru vždy false.) */
export function hasInCrowdHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(/;\s*/).includes(`${IN_CROWD_COOKIE}=1`);
}

/** V prohlížeči: smaže nápovědu (např. /me panáčka nenašlo). */
export function clearInCrowdHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${IN_CROWD_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Pro useSyncExternalStore: cookie se během stránky nemění (změna = nová navigace). */
export const subscribeInCrowd = () => () => {};
export const serverInCrowd = () => false;
