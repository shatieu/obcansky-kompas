import { randomInt } from "node:crypto";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ButtonLink, StickyBar } from "@/components/ui/button";
import { Notice, ScreenHeading } from "@/components/ui/typography";
import { JoinFlow, type EditInfo } from "@/components/demonstrace/join/join-flow";
import { HomeBackLink } from "@/components/demonstrace/home-link";
import { draftFromOwn, initialDraft, type JoinDraft } from "@/components/demonstrace/join/state";
import { demoTexts, type JoinTexts } from "@/components/demonstrace/join/texts";
import { getSql } from "@/lib/db/client";
import { getOwnerClaim, getOwnerSignatureId } from "@/lib/demo/owner";
import { DEFAULT_PRESET_ID, demoSlogans } from "@/lib/demo/slogans";
import { queryOwnDetail } from "@/lib/demo/tiles";
import { flags } from "@/lib/env";
import { getPublicSignature } from "@/lib/sign/read";

/**
 * /demonstrace/pripojit (SPEC-demonstrace §3). Jen s ověřeným podpisem: vlastnictví dokládá
 * httpOnly cookie `ok_owner` (nastaví ověření e-mailu nebo odkaz pro úpravu). Bez ní výzva
 * do kompasu. Kdo už v davu je, dostane úpravu (předvyplněnou, místo v davu zůstává).
 * Renderuje se při každém požadavku (cookie), nic se necachuje.
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: demoTexts().join.meta_title, robots: { index: false, follow: true } };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="k-wrap pt-1 pb-4 lg:pt-4 lg:pb-6">
      <div className="max-w-main">
        <HomeBackLink label={demoTexts().join.home_aria} className="mb-1" />
        {children}
      </div>
    </div>
  );
}

function Gate({ t }: { t: JoinTexts }) {
  return (
    <Shell>
      <ScreenHeading kicker={t.kicker} title={t.gate_title} lead={t.gate_lead} />
      <p className="k-cap mt-2">{t.gate_signed}</p>
      <StickyBar className="mt-4">
        <ButtonLink href="/kompas" block iconEnd="arrow-right">
          {t.gate_button}
        </ButtonLink>
      </StickyBar>
    </Shell>
  );
}

function Message({ t, text }: { t: JoinTexts; text: string }) {
  return (
    <Shell>
      <ScreenHeading kicker={t.kicker} title={demoTexts().page_title} />
      <div className="mt-2">
        <Notice tone="info">{text}</Notice>
      </div>
      <StickyBar className="mt-4">
        <ButtonLink href="/demonstrace" block iconEnd="arrow-right">
          {t.view_crowd_button}
        </ButtonLink>
      </StickyBar>
    </Shell>
  );
}

export default async function JoinPage() {
  const t = demoTexts().join;
  if (flags.staticDemo()) return <Message t={t} text={t.static_demo} />;
  if (flags.readOnly()) return <Message t={t} text={t.read_only} />;

  const jar = await cookies();
  if (!getOwnerClaim(jar)) return <Gate t={t} />;

  type Loaded = { kind: "gate" } | { kind: "error" } | { kind: "ok"; draft: JoinDraft; edit: EditInfo | null };
  const load = async (): Promise<Loaded> => {
    try {
      // Epocha cookie se ověří proti DB (odvolání / odhlášení cookie zneplatní).
      const owner = await getOwnerSignatureId(jar);
      if (!owner) return { kind: "gate" };
      const sig = await getPublicSignature(owner);
      if (!sig || sig.withdrawn || sig.verificationLevel === "unverified") return { kind: "gate" };
      // Stejná data jako GET /api/demonstrace/me/detail (soukromá část jen vlastníkovi, přímo z DB).
      const mine = await queryOwnDetail(getSql(), owner);
      if (mine) {
        const { own, ...person } = mine;
        return {
          kind: "ok",
          draft: draftFromOwn(person, own, DEFAULT_PRESET_ID),
          edit: { id: person.id, savedSlogan: own.sloganCustom, savedName: own.firstName, sloganStatus: own.sloganStatus, nameStatus: own.nameStatus, hidden: own.hidden },
        };
      }
      return { kind: "ok", draft: initialDraft(DEFAULT_PRESET_ID, randomInt(0, 2 ** 32 - 1)), edit: null };
    } catch {
      console.error("[demo] /demonstrace/pripojit: db unavailable");
      return { kind: "error" };
    }
  };
  const r = await load();
  if (r.kind === "gate") return <Gate t={t} />;
  if (r.kind === "error") return <Message t={t} text={t.error_generic} />;
  const { draft, edit } = r;

  return <JoinFlow texts={t} presets={demoSlogans.presets.map((p) => ({ id: p.id, text: p.text }))} initial={draft} edit={edit} />;
}
