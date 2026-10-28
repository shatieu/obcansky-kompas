import type { Metadata } from "next";
import { ButtonLink, StickyBar, TextLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SampleBanner } from "@/components/ui/sample";
import { Notice, ScreenHeading } from "@/components/ui/typography";
import { HomeBackLink } from "@/components/demonstrace/home-link";
import { maxIndexOf, pageCount, pageItems, pageRange, parsePage } from "@/components/demonstrace/list/pagination";
import { demoTexts } from "@/components/demonstrace/join/texts";
import { ui } from "@/lib/content";
import { fill, formatCount, formatDay } from "@/lib/crowd/format";
import type { TileItem } from "@/lib/demo/constants";
import { loadMeta, loadTile } from "@/lib/demo/read";
import { publicSignText } from "@/lib/share/demonstrace-data";

/**
 * /demonstrace/seznam – přístupná alternativa davu (SPEC-demonstrace §2): stránkovaný seznam
 * (pořadí, jméno nebo „Anonym“, slogan, datum). Data z cachovaných dlaždic (lib/demo/read),
 * tedy jen schválené texty a jména. Server-rendered, bez JS.
 */
export function generateMetadata(): Metadata {
  const t = demoTexts().list;
  return { title: t.meta_title, description: t.meta_description };
}

export default async function DemoListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = demoTexts().list;
  const sp = await searchParams;

  let items: TileItem[] = [];
  let page = 1;
  let pages = 0;
  let demo = false;
  let failed = false;
  try {
    const meta = await loadMeta();
    demo = meta.demo;
    if (meta.tiles > 0) {
      const last = await loadTile(meta.tiles - 1, true);
      pages = pageCount(maxIndexOf(last.items) ?? (meta.tiles - 1) * meta.tileSize);
      page = parsePage(sp.strana, pages);
      const { tile } = pageRange(page);
      const data = tile === meta.tiles - 1 ? last : await loadTile(tile, false);
      items = pageItems(data.items, page);
    }
  } catch {
    console.error("[demo] /demonstrace/seznam: data unavailable");
    failed = true;
  }

  const href = (p: number) => (p <= 1 ? "/demonstrace/seznam" : `/demonstrace/seznam?strana=${p}`);

  return (
    <div className="k-wrap pt-1 pb-4 lg:pt-4 lg:pb-6">
      <div className="max-w-main">
        <HomeBackLink label={t.home_aria} className="mb-1" />
        {demo && (
          <div className="mb-3">
            <SampleBanner title={ui.demo.banner_title} text={ui.demo.banner_text} />
          </div>
        )}
        <ScreenHeading kicker={t.kicker} title={t.title} lead={t.lead} />

        {failed ? (
          <div className="mt-3">
            <Notice tone="info">{t.unavailable}</Notice>
          </div>
        ) : items.length === 0 ? (
          <p className="mt-3">{t.empty}</p>
        ) : (
          <ol className="mt-3 list-none border-t-2 border-ink p-0" aria-label={fill(t.page_label, { page, pages })}>
            {items.map(([index, , , , slogan, name, id, day]) => {
              const who = name ?? t.anonymous;
              const text = publicSignText(slogan);
              return (
                <li key={id} className="border-b border-rule-soft">
                  <a href={`/demonstrace/${id}`} className="flex min-h-[56px] items-start gap-2 py-1.5 text-inherit no-underline hover:bg-blue-tint">
                    <span className="k-num w-[56px] flex-none lg:w-[72px] pt-[2px] text-right font-semibold">{fill(t.rank, { rank: formatCount(index + 1) })}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words">{who}</span>
                      {text && <span className="block break-words">„{text}“</span>}
                      {day && <span className="k-cap block">{fill(t.joined, { date: formatDay(day) })}</span>}
                    </span>
                    <Icon name="chevron-right" className="mt-[2px] flex-none" />
                  </a>
                </li>
              );
            })}
          </ol>
        )}

        {pages > 1 && (
          <nav aria-label={t.pagination_aria} className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {page > 1 ? (
              <a href={href(page - 1)} className="k-link min-h-[48px]" rel="prev">
                <Icon name="chevron-left" size={18} />
                {t.prev_button}
              </a>
            ) : (
              <span />
            )}
            <span className="k-cap" aria-current="page">
              {fill(t.page_label, { page, pages })}
            </span>
            {page < pages ? (
              <a href={href(page + 1)} className="k-link min-h-[48px]" rel="next">
                {t.next_button}
                <Icon name="chevron-right" size={18} />
              </a>
            ) : (
              <span />
            )}
          </nav>
        )}

        {pages > 2 && (
          // Skok na stranu bez JS: GET formulář se stejným parametrem ?strana= (mimo rozsah = 1 / poslední).
          <form action="/demonstrace/seznam" method="get" className="mt-2 flex flex-wrap items-end gap-1">
            <label className="flex flex-col gap-0.5">
              <span className="k-cap">{t.page_jump_label}</span>
              <input
                name="strana"
                type="number"
                inputMode="numeric"
                min={1}
                max={pages}
                defaultValue={page}
                required
                className="k-input min-h-[48px] w-[112px]"
              />
            </label>
            <button type="submit" className="k-btn k-btn--secondary">
              {t.page_jump_button}
            </button>
          </form>
        )}

        <p className="mt-3">
          <TextLink href="/demonstrace" icon="arrow-right">
            {t.crowd_button}
          </TextLink>
        </p>
        <StickyBar className="mt-4">
          <ButtonLink href="/demonstrace/pripojit" block iconEnd="arrow-right">
            {t.join_button}
          </ButtonLink>
        </StickyBar>
      </div>
    </div>
  );
}
