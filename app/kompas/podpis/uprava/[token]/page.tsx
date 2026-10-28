import type { Metadata } from "next";
import { EditPanel } from "@/components/sign/edit-panel";
import { ShortIdBadge } from "@/components/lookup/short-id-badge";
import { shortIdTexts } from "@/lib/sign/lookup-texts";
import { OwnerClaim } from "@/components/demonstrace/join/owner-claim";
import { demoTexts } from "@/components/demonstrace/join/texts";
import { Notice, ScreenHeading } from "@/components/ui/typography";
import { composeStatement, type Statement } from "@/lib/compose";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { TOKEN_RE } from "@/lib/sign/input";
import { loadEditable, type EditableSignature } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";

export const dynamic = "force-dynamic";

/** Jen texty dotazu na nahrazení vlastníka (ne celé texty připojení) – do klientské komponenty. */
function ownerClaimTexts() {
  const j = demoTexts().join;
  return {
    owner_conflict_title: j.owner_conflict_title,
    owner_conflict_lead: j.owner_conflict_lead,
    owner_conflict_replace: j.owner_conflict_replace,
    owner_conflict_keep: j.owner_conflict_keep,
    owner_conflict_kept: j.owner_conflict_kept,
  };
}

export function generateMetadata(): Metadata {
  return { title: signTexts().sign.edit_title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * Úprava / odvolání podpisu odkazem z e-mailu (SPEC §7.3). Zobrazení token nespotřebuje –
 * spotřebuje ho až uložení změn nebo odvolání.
 */
export default async function EditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = signTexts();
  if (flags.staticDemo()) {
    return (
      <div className="k-wrap pt-3 pb-4 lg:pt-5 lg:pb-6">
        <Notice tone="info">{t.sign.static_demo}</Notice>
      </div>
    );
  }
  let sig: EditableSignature | null = null;
  let failed = false;
  if (TOKEN_RE.test(token)) {
    try {
      sig = await loadEditable(getSql(), token);
    } catch {
      console.error("[sign] edit page: db unavailable");
      failed = true;
    }
  }
  if (failed || !sig) {
    return (
      <div className="k-wrap pt-3 pb-4 lg:pt-5 lg:pb-6">
        <ScreenHeading
          title={failed ? t.page.unavailable_title : t.sign.edit_invalid_title}
          lead={failed ? t.page.unavailable_lead : t.sign.edit_invalid_lead}
        />
      </div>
    );
  }
  let statement: Statement | null = null;
  try {
    statement = composeStatement(sig.answers, sig.contentVersion);
  } catch {
    statement = null; // neznámá verze obsahu
  }
  return (
    <div className="k-wrap pt-3 pb-4 lg:pt-5 lg:pb-6">
      <ScreenHeading title={t.sign.edit_title} lead={t.sign.edit_lead} />
      <ShortIdBadge className="mt-3 max-w-main" shortId={sig.shortId} texts={shortIdTexts()} />
      {/* Online demonstrace: cookie vlastníka i na jiném zařízení (SPEC-demonstrace §3). */}
      {!flags.readOnly() && <OwnerClaim token={token} texts={ownerClaimTexts()} />}
      <EditPanel
        t={t.sign}
        token={token}
        signature={{
          id: sig.signatureId,
          answers: sig.answers,
          showName: sig.showName,
          demographics: {
            region: sig.region ?? undefined,
            ageGroup: sig.ageGroup ?? undefined,
            municipalitySize: sig.municipalitySize ?? undefined,
            comment: sig.comment ?? undefined,
          },
        }}
        statement={statement && { intro: statement.intro, blocks: statement.blocks, outro: statement.outro }}
        readOnly={flags.readOnly()}
      />
    </div>
  );
}
