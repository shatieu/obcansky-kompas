import type { Metadata } from "next";
import { loadUiAkce } from "@/components/akce/load-texts";
import { LawView } from "@/components/law/law-view";
import { CONTENT_VERSION } from "@/lib/content";
import { loadLawContent } from "@/lib/law/load";
import { readSignatureForLaw } from "./signature";

/**
 * /v/[uuid]/zakon – Můj zákon (SPEC §10). Zákon se skládá z odpovědí podpisu (DB),
 * jinak z odpovědí v prohlížeči. PDF a DOCX vznikají v prohlížeči.
 *
 * Pozn. k nasazení: stránka je dynamická a čte content/law/*.yaml a content/ui.yaml
 * za běhu – next.config musí tyto soubory zahrnout do trace (outputFileTracingIncludes).
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: loadUiAkce().zakon.meta_title, robots: { index: false, follow: false } };
}

/** Datum sestavení v české časové zóně (server i klient vykreslí stejně). */
function todayCz(): string {
  const parts = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}. ${get("month")}. ${get("year")}`;
}

export default async function ZakonPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const signature = await readSignatureForLaw(uuid);
  return <LawView uuid={uuid} date={todayCz()} content={loadLawContent()} texts={loadUiAkce().zakon} initial={signature} browserContentVersion={CONTENT_VERSION} />;
}
