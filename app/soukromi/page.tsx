import type { Metadata } from "next";
import { aiEnabled } from "@/lib/moderation/ai";
import { pagesTexts } from "@/lib/org/texts";
import { Disclosure, Page, PageHead } from "../metodika/_ui";
import { pageMetadata } from "@/lib/seo/site";
import { seoTexts } from "@/lib/seo/texts";

/**
 * /soukromi (SPEC §14.4): správce (TODO(owner)), účel, právní základ (čl. 9 odst. 2 písm. a)
 * GDPR), zpracovatelé, retence (TODO(owner), návrh 12 měsíců), práva a jak je uplatnit.
 * Plausible se v seznamu zpracovatelů ukáže, jen když je nastavené NEXT_PUBLIC_PLAUSIBLE_DOMAIN.
 */
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return pageMetadata("/soukromi", pagesTexts().privacy.meta_title, seoTexts().descriptions.soukromi);
}

export default function PrivacyPage() {
  const p = pagesTexts().privacy;
  const processors = [
    p.processor_vercel,
    p.processor_supabase,
    p.processor_email,
    p.processor_turnstile,
    ...(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ? [p.processor_plausible] : []),
    // AI kontrola textů online demonstrace jen s nastaveným klíčem (SPEC-demonstrace §4.2).
    ...(aiEnabled() ? [p.processor_moderation] : []),
  ];
  return (
    <Page>
      <PageHead kicker={p.kicker} title={p.title} lead={p.lead} />
      <Disclosure title={p.controller_title}>
        <p>{p.controller_body}</p>
      </Disclosure>
      <Disclosure title={p.data_title}>
        <p>{p.data_body}</p>
      </Disclosure>
      <Disclosure title={p.purpose_title}>
        <p>{p.purpose_body}</p>
      </Disclosure>
      <Disclosure title={p.basis_title}>
        <p>{p.basis_body}</p>
      </Disclosure>
      <Disclosure title={p.processors_title} sub={p.processors_lead}>
        <ul className="list-[square] pl-2">
          {processors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Disclosure>
      <Disclosure title={p.retention_title}>
        <p>{p.retention_body}</p>
      </Disclosure>
      <Disclosure title={p.logs_title}>
        <p>{p.logs_body}</p>
      </Disclosure>
      <Disclosure title={p.browser_title}>
        <p>{p.browser_body}</p>
      </Disclosure>
      <Disclosure title={p.demo_title}>
        <p>{p.demo_body}</p>
        <p className="mt-1">{p.demo_check_body}</p>
        <p className="mt-1">{p.demo_withdraw_body}</p>
      </Disclosure>
      <Disclosure title={p.rights_title}>
        <p>{p.rights_body}</p>
      </Disclosure>
      <Disclosure title={p.how_title}>
        <p>{p.how_body}</p>
      </Disclosure>
    </Page>
  );
}
