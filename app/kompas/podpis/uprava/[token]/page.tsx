import type { Metadata } from "next";
import { EditPanel } from "@/components/sign/edit-panel";
import { Notice } from "@/components/sign/notice";
import { container, h1 } from "@/components/sign/styles";
import { composeStatement } from "@/lib/compose";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { TOKEN_RE } from "@/lib/sign/input";
import { loadEditable, type EditableSignature } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";

export const dynamic = "force-dynamic";

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
      <div className={`${container} py-8 md:py-12`}>
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
      <div className={`${container} py-8 md:py-12`}>
        <h1 className={h1}>{failed ? t.page.unavailable_title : t.sign.edit_invalid_title}</h1>
        <p className="mt-3">{failed ? t.page.unavailable_lead : t.sign.edit_invalid_lead}</p>
      </div>
    );
  }
  let text = "";
  try {
    text = composeStatement(sig.answers, sig.contentVersion).text;
  } catch {
    text = "";
  }
  return (
    <div className={`${container} py-8 md:py-12`}>
      <h1 className={h1}>{t.sign.edit_title}</h1>
      <p className="mt-3">{t.sign.edit_lead}</p>
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
        statement={text}
        readOnly={flags.readOnly()}
      />
    </div>
  );
}
