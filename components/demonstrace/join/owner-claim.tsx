"use client";

import { useEffect } from "react";

/**
 * Neviditelné: na stránce úpravy podpisu (odkaz z e-mailu) nastaví cookie vlastníka pro online
 * demonstraci (POST /api/demonstrace/owner, token se nespotřebuje). Díky tomu se člověk připojí
 * i na jiném zařízení, než kde podpis ověřil. Chyba nevadí – úprava podpisu funguje dál.
 */
export function OwnerClaim({ token }: { token: string }) {
  useEffect(() => {
    void fetch("/api/demonstrace/owner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    }).catch(() => {});
  }, [token]);
  return null;
}
