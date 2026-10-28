import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/sign/icon";
import { Notice, PocBadge } from "@/components/sign/notice";
import { ManageLinkForm, ReportForm, ShareButton } from "@/components/sign/signature-actions";
import { container, h1, h2, kicker } from "@/components/sign/styles";
import { StanceBlock } from "@/components/stance-block";
import { composeStatement, evaluate, isAnswered, QUESTION_IDS, type Statement } from "@/lib/compose";
import { formatAmount } from "@/lib/compose/q1";
import { questionsFile, t as fill, ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { UUID_RE } from "@/lib/sign/input";
import { getPublicSignature, type PublicSignature } from "@/lib/sign/read";
import { signTexts, type SignTexts } from "@/lib/sign/texts";
import { turnstileSiteKey } from "@/lib/turnstile";

/**
 * /v/[uuid] – osobní stránka (SPEC §7.3). Data z cache s tagem `sig:<uuid>` (lib/sign/read),
 * po ověření / úpravě / odvolání se zneplatní přes revalidateTag. Nikdy se neindexuje.
 */
export function generateMetadata(): Metadata {
  return { title: signTexts().page.meta_title, robots: { index: false, follow: false } };
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
  return <div className={`${container} py-8 md:py-12`}>{children}</div>;
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
        <h1 className={h1}>{t.unavailable_title}</h1>
        <p className="mt-3">{t.unavailable_lead}</p>
        <a href={`/v/${uuid}`} className="mt-6 inline-flex min-h-12 items-center gap-2 font-semibold underline">
          <Icon name="refresh" />
          {t.retry_button}
        </a>
      </Shell>
    );
  }
  if (!sig) notFound();

  if (sig.withdrawn) {
    return (
      <Shell>
        <p className={kicker}>{t.kicker}</p>
        <h1 className={`${h1} mt-2`}>{t.withdrawn_title}</h1>
        <p className="mt-3">{t.withdrawn_lead}</p>
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
        <div className="flex flex-wrap items-center gap-3">
          <p className={kicker}>{t.kicker}</p>
          {sig.isPoc && <PocBadge label={t.poc_badge} />}
        </div>
        <h1 className={`${h1} mt-2 break-words`}>{signer}</h1>

        {statement && <p className="mt-6 text-[19px] leading-7 md:text-[22px] md:leading-8">{statement.text}</p>}

        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y-2 border-ink py-4 text-[15px] leading-[22px]">
          <dt className="font-semibold">{t.date_label}</dt>
          <dd className="tabular">{dateFmt.format(new Date(sig.createdAt))}</dd>
          <dt className="font-semibold">{t.level_label}</dt>
          <dd>{levelLabel}</dd>
        </dl>

        <div className="mt-8">
          <ShareButton t={t} title={signer} />
        </div>
        <nav className="mt-4 border-t-2 border-ink">
          {[
            { href: `/v/${sig.id}/srovnani`, label: t.compare_button, icon: "compare" as const },
            { href: `/v/${sig.id}/zakon`, label: t.law_button, icon: "law" as const },
          ].map((a) => (
            <a key={a.href} href={a.href} className="flex min-h-14 items-center gap-3 border-b-2 border-ink text-lg font-semibold text-ink no-underline hover:bg-blue-tint">
              <Icon name={a.icon} />
              <span className="flex-1">{a.label}</span>
              <Icon name="chevron-right" />
            </a>
          ))}
        </nav>

        <details className="group mt-8 border-b-2 border-ink">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between font-semibold">
            {t.answers_title}
            <Icon name="chevron-down" className="transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <dl className="pb-4">
            {answerRows(sig, t).map((r) => (
              <div key={r.qid} className="border-t border-ink/20 py-3">
                <dt className="text-[15px] leading-[22px] text-muted">{r.question}</dt>
                <dd className="font-semibold">{r.value}</dd>
              </div>
            ))}
          </dl>
        </details>

        {sig.comment && (
          <section className="mt-8">
            <h2 className={h2}>{t.comment_title}</h2>
            {/* Uživatelský obsah jen jako prostý text (SPEC §14.3). */}
            <p className="mt-2 whitespace-pre-line break-words">{sig.comment}</p>
            <details className="mt-3">
              <summary className="inline-flex min-h-12 cursor-pointer list-none items-center gap-2 font-semibold underline">
                <Icon name="alert" />
                {t.report_open_button}
              </summary>
              <div className="mt-3 bg-blue-tint p-4">
                {writesOff ? <Notice tone="info">{writesOff}</Notice> : <ReportForm t={t} id={sig.id} siteKey={siteKey} />}
              </div>
            </details>
          </section>
        )}
      </Shell>

      <StanceBlock />

      <Shell>
        <details className="border-y-2 border-ink">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
            {t.manage_title}
            <Icon name="chevron-down" />
          </summary>
          <div className="pb-6">
            <p className="mb-4">{t.manage_lead}</p>
            <ManageLinkForm t={t} siteKey={siteKey} disabledMessage={writesOff} />
          </div>
        </details>
      </Shell>
    </>
  );
}
