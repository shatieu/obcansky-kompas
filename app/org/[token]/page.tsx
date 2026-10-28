import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSql, hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { findPendingByToken } from "@/lib/org/service";
import { pagesTexts } from "@/lib/org/texts";
import { Page } from "../../metodika/_ui";
import { OrgForm } from "./org-form";

/**
 * /org/[token] (SPEC §12, §13): neveřejný formulář pro strany a hnutí. Neplatný nebo už
 * použitý token = 404. Nikdy se necachuje ani neindexuje; token neodchází v Referer.
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: pagesTexts().org.meta_title,
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export default async function OrgPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (flags.staticDemo() || !hasDatabase()) notFound();
  let org;
  try {
    org = await findPendingByToken(getSql(), token);
  } catch (e) {
    console.error("[org] dotaz selhal:", (e as Error).message);
    throw new Error("unavailable");
  }
  if (!org) notFound();
  return (
    <Page>
      <OrgForm token={token} name={org.name} t={pagesTexts().org} />
    </Page>
  );
}
