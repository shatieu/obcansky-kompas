import type { Metadata } from "next";
import { t } from "@/lib/content";
import { buildSourcesIndex, type ClaimSource, type SourceGroup, type VerdictState } from "@/lib/methodology/sources";
import { formatDateCz } from "@/lib/org/format";
import { pagesTexts, type PagesTexts } from "@/lib/org/texts";
import { Icon } from "@/components/ui/icon";
import { Disclosure, Page, PageHead } from "../_ui";
import { pageMetadata } from "@/lib/seo/site";
import { seoTexts } from "@/lib/seo/texts";

/**
 * /metodika/zdroje (SPEC §11, §13): každé tvrzení se zdrojem, místem ve zdroji a posledním
 * verdiktem. Generuje se při sestavení z content/explainers, content/facts.yaml a
 * content/verification – za běhu nic nečte.
 */
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return pageMetadata("/metodika/zdroje", pagesTexts().sources.meta_title, seoTexts().descriptions.zdroje);
}

type S = PagesTexts["sources"];

const verdictKey: Record<VerdictState, keyof S> = {
  ano: "verdict_ano",
  ne: "verdict_ne",
  oprava: "verdict_oprava",
  missing: "verdict_missing",
  changed: "verdict_changed",
};

function groupTitle(g: SourceGroup, s: S): string {
  if (g.kind === "law") return s.group_law;
  if (g.kind === "facts") return s.group_facts;
  return t(s.group_explainer, { id: g.id });
}

function Claim({ c, s }: { c: ClaimSource; s: S }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-2">
      <dt className="text-caption text-ink-secondary">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{value}</dd>
    </div>
  );
  return (
    <li id={c.id} className="border-t border-rule-soft pt-2">
      <p className="font-semibold">{c.claim}</p>
      <dl className="mt-1 flex flex-col gap-0.5 text-small">
        {row(
          s.source,
          <a href={c.sourceUrl} className="break-words" rel="noopener noreferrer">
            {c.sourceTitle || c.sourceUrl}
          </a>,
        )}
        {row(s.locator, c.locator || s.none)}
        {row(s.verdict, <strong>{s[verdictKey[c.state]]}</strong>)}
        {c.correction && row("", t(s.correction, { text: c.correction }))}
        {row(s.round, c.round ?? s.none)}
        {row(s.verifier, c.verifier ?? s.none)}
        {row(s.checked_at, c.checkedAt ? formatDateCz(c.checkedAt) : s.none)}
        {row(s.human_reviewed, c.humanReviewed ? s.yes : s.no)}
        {row("ID", <span className="k-num">{c.id}</span>)}
      </dl>
    </li>
  );
}

export default function SourcesPage() {
  const s = pagesTexts().sources;
  const index = buildSourcesIndex();
  return (
    <Page>
      <PageHead kicker={s.kicker} title={s.title} lead={s.lead} />
      <p className="k-cap mb-2">{s.generated}</p>
      {index.groups.map((g) => {
        const verified = g.claims.filter((c) => c.state === "ano").length;
        const status = g.shown === null ? "" : ` · ${g.shown ? s.explainer_shown : s.explainer_pending}`;
        return (
          <Disclosure
            key={`${g.kind}-${g.id}`}
            id={`skupina-${g.id}`}
            title={groupTitle(g, s)}
            sub={`${t(s.claims_count, { n: g.claims.length })} · ${s.verdict_ano}: ${verified}${status}${g.humanReviewed ? ` · ${s.human_reviewed}: ${s.yes}` : ""}`}
          >
            {g.claims.length === 0 ? (
              <p>{s.none}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {g.claims.map((c) => (
                  <Claim key={c.id} c={c} s={s} />
                ))}
              </ul>
            )}
          </Disclosure>
        );
      })}
      <p className="mt-4">
        <a href="/metodika" className="k-link">
          <Icon name="chevron-left" size={18} />
          {s.back_button}
        </a>
      </p>
    </Page>
  );
}
