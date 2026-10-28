import type { AddresseeType } from "@/lib/letters";

/**
 * Anonymní událost `letter_prepared` (SPEC §9.2): server dostane jen typ adresáta,
 * nikdy obsah dopisu. Jednou za typ a načtení stránky. Chyby se ignorují.
 * Endpoint POST /api/event vlastní jiný agent.
 */
const sent = new Set<string>();

export function reportLetterPrepared(type: AddresseeType): void {
  if (sent.has(type)) return;
  sent.add(type);
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "letter_prepared", key: type }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* bez sítě nevadí */
  }
}
