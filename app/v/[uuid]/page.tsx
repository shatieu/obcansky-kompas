import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink, ActionList } from "@/components/ui/action-list";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SampleBadge } from "@/components/ui/sample";
import { StanceBlock } from "@/components/ui/stance-block";
import { Kicker, Notice, ScreenHeading, SectionTitle } from "@/components/ui/typography";
import { ShareArrival } from "@/components/share/share-arrival";
import { SharePanel } from "@/components/share/share-panel";
import { ManageLinkForm, ReportForm } from "@/components/sign/signature-actions";
import { podpisCard } from "@/lib/share/card";
import { lookupSignature } from "@/lib/share/data";
import { momentFromSearch, shareMetadata, signatureVersion } from "@/lib/share/metadata";
import { sharePanelTexts, shareTexts } from "@/lib/share/texts";
import { composeStatement, evaluate, isAnswered, QUESTION_IDS, type Statement } from "@/lib/compose";
import { formatAmount } from "@/lib/compose/q1";
import { questionsFile, stance, t as fill, ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { UUID_RE } from "@/lib/sign/input";
import { getPublicSignature, type PublicSignature } from "@/lib/sign/read";
import { signTexts, type SignTexts } from "@/lib/sign/texts";
import { turnstileSiteKey } from "@/lib/turnstile";

/**
 * /v/[uuid] – osobní stránka (SPEC §7.3). Data z cache s tagem `sig:<uuid>` (lib/sign/read),
 * po ověření / úpravě / odvolání se zneplatní přes revalidateTag. Nikdy se neindexuje.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const base: Metadata = { title: signTexts().page.meta_title, robots: { index: false, follow: false } };
  const { uuid } = await params;
  if (!UUID_RE.test(uuid) || flags.staticDemo()) return base;
  // Sdílený odkaz ?s=<moment> → OG obrázek toho momentu (SPEC §9.4); výchozí je podpis.
  const moment = momentFromSearch((await searchParams).s, "podpis");
  const id = uuid.toLowerCase();
  const found = await lookupSignature(id);
  const v = found.status === "ok" ? signatureVersion(found.signature) : undefined;
  return { ...base, ...shareMetadata(moment === "zakon" || moment === "srovnani" ? moment : "podpis", { id, v }) };
}

const dateFmt = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Prague" });

function answerRows(sig: PublicSignature, t: SignTexts["page"]) {
  const { states } = evaluate(sig.answers, questionsFile);
  return QUESTION_IDS.map((qid) => {
    const q = questionsFile.questions.find((x) => x.id === qid)!;
    const v = sig.answers[qid];
    const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
    let value: string;
    if (states[qid].status === "skipped") value = t.skipped;
    else if (!isAnswered(v)) value = t.not_answered;
    else if (typeof v === "number") value = formatAmount(v, { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole });
    else if (Array.isArray(v)) value = v.map(label).join(", ");
    else value = label(v as string);
    return { qid, question: q.short, value };
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="k-wrap pt-3 pb-4 lg:pt-5 lg:pb-6">{children}</div>;
}

export default async function SignaturePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const t = signTexts().page;

  if (flags.staticDemo()) {
    return (
      <Shell>
        <Notice tone="info">{t.static_demo}</Notice>
      </Shell>
    );
  }
  if (!UUID_RE.test(uuid)) notFound();

  let sig: PublicSignature | null;
  try {
    sig = await getPublicSignature(uuid.toLowerCase());
  } catch {
    console.error("[sign] /v page: db unavailable");
    return (
      <Shell>
        <ScreenHeading title={t.unavailable_title} lead={t.unavailable_lead} />
        <ButtonLink href={`/v/${uuid}`} variant="secondary" icon="refresh" className="mt-2">
          {t.retry_button}
        </ButtonLink>
      </Shell>
    );
  }
  if (!sig) notFound();

  if (sig.withdrawn) {
    return (
      <Shell>
        <ScreenHeading kicker={t.kicker} title={t.withdrawn_title} lead={t.withdrawn_lead} />
      </Shell>
    );
  }

  let statement: Statement | null = null;
  try {
    statement = composeStatement(sig.answers, sig.contentVersion);
  } catch {
    statement = null; // neznámá verze obsahu – odpovědi níže zůstanou
  }
  const levelLabel = { unverified: t.level_unverified, email: t.level_email, sms: t.level_sms, bankid: t.level_bankid }[sig.verificationLevel];
  const signer = sig.name ? fill(t.signed_by, { name: sig.name }) : t.anonymous;
  const writesOff = flags.readOnly() ? signTexts().sign.read_only : null;
  const siteKey = turnstileSiteKey();

  return (
    <>
      <Shell>
        <div className="max-w-main">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Kicker className="m-0">
              <span className="k-num">
                {t.date_label} {dateFmt.format(new Date(sig.createdAt))}
              </span>
            </Kicker>
            {sig.isPoc && <SampleBadge>{t.poc_badge}</SampleBadge>}
          </div>
          <h1 className="k-h k-h1 mt-1 break-words">{t.title}</h1>

          {statement && (
            <div className="k-letter mt-2">
              <p className="k-letter__meta">{t.kicker}</p>
              <p className="mt-1">{statement.text}</p>
            </div>
          )}
          <p className="k-cap mt-1 break-words">
            {signer} · {t.level_label}: {levelLabel}
          </p>

          <ActionList className="mt-4">
            <ActionLink href={`/v/${sig.id}/srovnani`} icon="compare">
              {t.compare_button}
            </ActionLink>
            <ActionLink href={`/v/${sig.id}/zakon`} icon="law">
              {t.law_button}
            </ActionLink>
          </ActionList>

          <details className="group border-b-2 border-ink">
            <summary className="k-action list-none">
              <span className="k-action__main">{t.answers_title}</span>
              <Icon name="chevron-down" className="transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <dl className="pb-2">
              {answerRows(sig, t).map((r) => (
                <div key={r.qid} className="border-t border-rule-soft py-1.5">
                  <dt className="k-cap">{r.question}</dt>
                  <dd className="font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
          </details>

          {sig.comment && (
            <section className="mt-4">
              <SectionTitle>{t.comment_title}</SectionTitle>
              {/* Uživatelský obsah jen jako prostý text (SPEC §14.3). */}
              <p className="mt-1 whitespace-pre-line break-words">{sig.comment}</p>
              <details className="mt-1">
                <summary className="k-link list-none">
                  <Icon name="alert" />
                  {t.report_open_button}
                </summary>
                <div className="k-letter mt-1">
                  {writesOff ? <Notice tone="info">{writesOff}</Notice> : <ReportForm t={t} id={sig.id} siteKey={siteKey} />}
                </div>
              </details>
            </section>
          )}

          <div className="mt-4">
            <ShareArrival />
            {/* Primární „Sdílet“: SharePanel ho dává do StickyBar (mobil), na desktopu v toku. */}
            <SharePanel card={podpisCard(sig.answers, questionsFile, shareTexts().share.image, sig.name)} url={`/v/${sig.id}`} texts={sharePanelTexts()} buttonLabel={t.share_button} />
          </div>
        </div>
      </Shell>

      <StanceBlock
        kicker={stance.title}
        text={stance.text}
        by={ui.stance.by}
        ariaLabel={ui.stance.region_aria}
        primary={stance.actions[0]!}
        secondary={stance.actions[1]}
      />

      <Shell>
        <details className="group max-w-main border-y-2 border-ink">
          <summary className="k-action list-none">
            <span className="k-action__main">{t.manage_title}</span>
            <Icon name="chevron-down" className="transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <div className="pb-3">
            <p className="mb-2">{t.manage_lead}</p>
            <ManageLinkForm t={t} siteKey={siteKey} disabledMessage={writesOff} />
          </div>
        </details>
      </Shell>
    </>
  );
}
