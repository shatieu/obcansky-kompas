import type { Metadata } from "next";
import { VerifyClient } from "@/components/sign/verify-client";
import { shortIdTexts } from "@/lib/sign/lookup-texts";
import { signTexts } from "@/lib/sign/texts";

export function generateMetadata(): Metadata {
  return { title: signTexts().verify.meta_title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** /overeni/[token] (SPEC §7.2, §13): potvrzení (noční plocha FlagUnfold) a přesměrování na /v/[uuid]. */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="k-wrap">
      <VerifyClient token={token} t={signTexts().verify} shortIdTexts={shortIdTexts()} />
    </div>
  );
}
