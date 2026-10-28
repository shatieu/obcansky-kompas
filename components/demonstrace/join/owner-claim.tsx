"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/typography";

export interface OwnerClaimTexts {
  owner_conflict_title: string;
  owner_conflict_lead: string;
  owner_conflict_replace: string;
  owner_conflict_keep: string;
  owner_conflict_kept: string;
}

const claim = (token: string, replace: boolean) =>
  fetch("/api/demonstrace/owner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(replace ? { token, replace: true } : { token }),
    credentials: "same-origin",
  });

/**
 * Na stránce úpravy podpisu (odkaz z e-mailu) nastaví cookie vlastníka pro online demonstraci
 * (POST /api/demonstrace/owner, token se nespotřebuje). Díky tomu se člověk připojí i na jiném
 * zařízení, než kde podpis ověřil. Chyba nevadí – úprava podpisu funguje dál.
 * Když je v prohlížeči přihlášený jiný podpis (409 owner_conflict), cookie se tiše nepřepíše:
 * zobrazí se dotaz „Nahradit / Nechat původní“ (bezpečnostní review).
 */
export function OwnerClaim({ token, texts: t }: { token: string; texts: OwnerClaimTexts }) {
  const [state, setState] = useState<"idle" | "conflict" | "kept">("idle");
  useEffect(() => {
    claim(token, false)
      .then((r) => {
        if (r.status === 409) setState("conflict");
      })
      .catch(() => {});
  }, [token]);

  if (state === "kept") return <p className="k-cap mb-2" role="status">{t.owner_conflict_kept}</p>;
  if (state !== "conflict") return null;
  return (
    <Notice tone="info" role="status" className="mb-2">
      <strong className="block">{t.owner_conflict_title}</strong>
      <span className="k-cap block">{t.owner_conflict_lead}</span>
      <span className="mt-1 flex flex-wrap gap-1">
        <Button
          variant="primary"
          onClick={() =>
            void claim(token, true)
              .then(() => setState("idle"))
              .catch(() => setState("idle"))
          }
        >
          {t.owner_conflict_replace}
        </Button>
        <Button variant="secondary" onClick={() => setState("kept")}>
          {t.owner_conflict_keep}
        </Button>
      </span>
    </Notice>
  );
}
