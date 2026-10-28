import type { Moment } from "./moments";

/**
 * Cookieless počítání sdílení: POST /api/event {kind:"share", key}. Žádné ID, žádné cookies.
 * `share`: jednou za moment a načtení stránky (kopírování + stažení se nesčítá dvakrát).
 * `arrival`: příchod přes sdílený odkaz (`?s=<moment>`) → key `<moment>:visit`.
 */
const sent = new Set<string>();

function post(key: string) {
  if (sent.has(key)) return;
  sent.add(key);
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "share", key }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    /* bez sítě nevadí */
  }
}

export const reportShare = (moment: Moment) => post(moment);
export const reportArrival = (moment: Moment) => post(`${moment}:visit`);
