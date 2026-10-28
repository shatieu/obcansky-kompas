import type { ReactNode } from "react";
import { ButtonLink, StickyBar } from "@/components/ui/button";
import { ScreenHeading } from "@/components/ui/typography";
import { Section } from "./_section";

/**
 * Stavební kousky textových stránek (/metodika, /metodika/zdroje, /hnuti, /o-projektu,
 * /soukromi, /org) nad components/ui: hlavička obrazovky, sekce za „Co to znamená?“,
 * přilepená primární akce. Delší texty (*_body) jsou vždy za rozbalením.
 */

export function PageHead({ kicker, title, lead }: { kicker?: string; title: string; lead: string }) {
  return <ScreenHeading kicker={kicker} title={title} lead={lead} className="mb-4" />;
}

/** Sekce za řádkem „Co to znamená?“ (Disclosure z components/ui). */
export const Disclosure = Section;

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="k-link" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Jediná primární akce obrazovky: na mobilu přilepená dole, na desktopu pod obsahem. */
export function PrimaryAction({ href, children, download }: { href: string; children: ReactNode; download?: boolean }) {
  return (
    <StickyBar className="mt-4">
      <ButtonLink href={href} block iconEnd="arrow-right" download={download}>
        {children}
      </ButtonLink>
    </StickyBar>
  );
}

/** Textová stránka: okraje .k-wrap, hlavní sloupec 688 px. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="k-wrap">
      <div className="max-w-main py-3 lg:py-6">{children}</div>
    </div>
  );
}
