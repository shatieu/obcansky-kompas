import type { Metadata } from "next";
import { pagesTexts } from "@/lib/org/texts";
import { Disclosure, Page, PageHead, PrimaryAction } from "../metodika/_ui";

/** /o-projektu (SPEC §13): spolek (TODO(owner)), kontakt (TODO(owner)), repozitář, AGPL. Statická. */
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return { title: pagesTexts().about.meta_title };
}

export default function AboutPage() {
  const a = pagesTexts().about;
  return (
    <Page>
      <PageHead kicker={a.kicker} title={a.title} lead={a.lead} />
      <Disclosure title={a.association_title}>
        <p>{a.association_body}</p>
      </Disclosure>
      <Disclosure title={a.contact_title}>
        <p>{a.contact_body}</p>
      </Disclosure>
      <Disclosure title={a.independence_title}>
        <p>{a.independence_body}</p>
      </Disclosure>
      <Disclosure title={a.repo_title}>
        <p>{a.repo_body}</p>
      </Disclosure>
      <Disclosure title={a.security_title}>
        <p>{a.security_body}</p>
        <p>
          <a href="/.well-known/security.txt" className="k-link">
            security.txt
          </a>
        </p>
      </Disclosure>
      <PrimaryAction href={a.repo_url}>{a.repo_button}</PrimaryAction>
    </Page>
  );
}
