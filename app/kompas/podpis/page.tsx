import type { Metadata } from "next";
import { shortIdTexts } from "@/lib/sign/lookup-texts";
import { SignForm } from "@/components/sign/sign-form";
import { ScreenHeading } from "@/components/ui/typography";
import { flags } from "@/lib/env";
import { signTexts } from "@/lib/sign/texts";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: signTexts().sign.meta_title, robots: { index: false, follow: false } };
}

/** /kompas/podpis (SPEC §7.1, §13): text, formulář, souhlas. Obrazovka „Podpis“ design systému. */
export default function SignPage() {
  const t = signTexts().sign;
  const mode = flags.staticDemo() ? "static" : flags.readOnly() ? "read_only" : "open";
  return (
    <div className="k-wrap pt-3 pb-4 lg:pt-5 lg:pb-6">
      <ScreenHeading title={t.title} lead={t.lead} />
      <SignForm t={t} mode={mode} siteKey={turnstileSiteKey()} shortIdTexts={shortIdTexts()} />
    </div>
  );
}
