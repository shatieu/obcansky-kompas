import type { Metadata } from "next";
import { container } from "@/components/sign/styles";
import { VerifyClient } from "@/components/sign/verify-client";
import { signTexts } from "@/lib/sign/texts";

export function generateMetadata(): Metadata {
  return { title: signTexts().verify.meta_title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** /overeni/[token] (SPEC §7.2, §13): potvrzení a přesměrování na /v/[uuid]. */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className={container}>
      <VerifyClient token={token} t={signTexts().verify} />
    </div>
  );
}
