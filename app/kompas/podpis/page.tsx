import type { Metadata } from "next";
import { SignForm } from "@/components/sign/sign-form";
import { container, h1 } from "@/components/sign/styles";
import { flags } from "@/lib/env";
import { signTexts } from "@/lib/sign/texts";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: signTexts().sign.meta_title, robots: { index: false, follow: false } };
}

/** /kompas/podpis (SPEC §7.1, §13): text, formulář, souhlas. */
export default function SignPage() {
  const t = signTexts().sign;
  const mode = flags.staticDemo() ? "static" : flags.readOnly() ? "read_only" : "open";
  return (
    <div className={`${container} py-8 md:py-12`}>
      <h1 className={h1}>{t.title}</h1>
      <p className="mt-3 text-[17px] leading-[26px]">{t.lead}</p>
      <SignForm t={t} mode={mode} siteKey={turnstileSiteKey()} />
    </div>
  );
}
