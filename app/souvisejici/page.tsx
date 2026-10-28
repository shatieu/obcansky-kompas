import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { Kicker, SectionTitle } from "@/components/ui/typography";
import { INITIATIVES_ANCHOR, links, READING_ANCHOR } from "@/lib/content/links";
import type { LinkItem } from "@/lib/content/links-schema";
import { Page, PageHead } from "../metodika/_ui";
import { pageMetadata } from "@/lib/seo/site";

/**
 * /souvisejici „Odkazy a čtení“ (požadavek vlastníka 2026-10-28). Dvě jasně oddělené části:
 * „K přečtení“ – nestranné úřední zdroje (odkaz z /metodika a z patičky); „Související iniciativy“ –
 * kontext postoje spolku na ploše bloku „Kde stojíme my“ (odkaz jen z bloku postoje, nikdy z kompasu,
 * vysvětlivek ani statistik – SPEC §1). Externí odkazy se otevírají normálně, bez měření. Statická.
 */
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return pageMetadata("/souvisejici", links.meta_title, links.lead);
}

function LinkList({ items, onBlue = false }: { items: LinkItem[]; onBlue?: boolean }) {
  return (
    <ul className={onBlue ? "mt-3 border-t border-on-blue" : "mt-2 border-t-2 border-ink"}>
      {items.map((it) => (
        <li key={it.id} className={onBlue ? "border-b border-on-blue py-2" : "border-b border-rule-soft py-2"}>
          <a href={it.url} rel="noopener noreferrer" className={onBlue ? "k-link text-inherit" : "k-link"}>
            {it.title}
            <Icon name="external" size={18} />
            <span className="sr-only"> {links.external_note}</span>
          </a>
          <p>{it.description}</p>
          <p className={onBlue ? "k-cap mt-0.5 text-inherit" : "k-cap mt-0.5"}>
            {links.types[it.type]} · {links.publisher_label}: {it.publisher}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function LinksPage() {
  const { reading, initiatives } = links;
  return (
    <>
      <Page>
        <PageHead kicker={links.kicker} title={links.title} lead={links.lead} />
        <section aria-labelledby={READING_ANCHOR}>
          <SectionTitle id={READING_ANCHOR}>{reading.title}</SectionTitle>
          <p className="k-cap mt-1">{reading.lead}</p>
          <LinkList items={reading.items} />
        </section>
      </Page>

      {/* Iniciativy na ploše postoje spolku – vizuálně i obsahově mimo nestranný kompas. */}
      <section className="k-stance" aria-labelledby={INITIATIVES_ANCHOR}>
        <div className="mx-auto max-w-content">
          <Kicker as="div">{initiatives.kicker}</Kicker>
          <h2 id={INITIATIVES_ANCHOR} className="k-h k-h2 mt-1">
            {initiatives.title}
          </h2>
          <p className="mt-1">{initiatives.lead}</p>
          <LinkList items={initiatives.items} onBlue />
        </div>
      </section>
    </>
  );
}
