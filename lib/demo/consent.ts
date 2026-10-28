import { sha256Hex } from "@/lib/crypto";
import { demoTexts } from "@/components/demonstrace/join/texts";

/**
 * Verze textu souhlasu se zveřejněním (bezpečnostní review, DECISIONS.md): prvních 16 hex znaků
 * SHA-256 ze znění `demonstrace.join.consent_label` + `consent_caption` v content/ui.yaml. Ukládá se
 * do `app.demonstrator.consent_version` při připojení a obnoví se s `consent_at` při každé úpravě –
 * jde tak doložit, se kterým zněním člověk souhlasil. Jen server.
 */
export function demoConsentVersion(): string {
  const j = demoTexts().join;
  return sha256Hex(`${j.consent_label}\n${j.consent_caption}`).slice(0, 16);
}
