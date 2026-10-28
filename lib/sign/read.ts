import { unstable_cache } from "next/cache";
import type postgres from "postgres";
import type { Answers } from "@/lib/compose/types";
import { decrypt } from "@/lib/crypto";
import { getSql } from "@/lib/db/client";
import { UUID_RE } from "./input";

/**
 * Veřejná data osobní stránky /v/[uuid] (SPEC §7.3). Nikdy nevrací e-mail ani adresu;
 * jméno jen se souhlasem (show_name). Cache s tagem `sig:<uuid>` (SPEC §14.2).
 */
export interface PublicSignature {
  id: string;
  /** Číslo podpisu (kanonický tvar bez pomlčky) – alias UUID, nic dalšího neprozrazuje. */
  shortId: string;
  answers: Answers;
  contentVersion: string;
  comment: string | null;
  verificationLevel: "unverified" | "email" | "sms" | "bankid";
  verifiedAt: string | null;
  withdrawn: boolean;
  createdAt: string;
  /** Jméno jen se souhlasem; jinak null. */
  name: string | null;
  isPoc: boolean;
  isSeed: boolean;
}

export const signatureTag = (id: string) => `sig:${id}`;

export async function loadPublicSignature(sql: postgres.Sql, id: string): Promise<PublicSignature | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<
    {
      id: string;
      short_id: string;
      answers: Answers;
      content_version: string;
      comment: string | null;
      verification_level: PublicSignature["verificationLevel"];
      verified_at: Date | null;
      withdrawn_at: Date | null;
      created_at: Date;
      is_poc: boolean;
      is_seed: boolean;
      show_name: boolean | null;
      name_enc: string | null;
    }[]
  >`
    select s.id, s.short_id, s.answers, s.content_version, s.comment, s.verification_level, s.verified_at, s.withdrawn_at,
           s.created_at, s.is_poc, s.is_seed, r.show_name, case when r.show_name then r.name_enc end as name_enc
    from app.signature s left join app.signer r on r.signature_id = s.id
    where s.id = ${id}`;
  if (!row) return null;
  let name: string | null = null;
  if (row.show_name && row.name_enc && !row.withdrawn_at) {
    try {
      name = decrypt(row.name_enc);
    } catch {
      name = null;
    }
  }
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    id: row.id,
    shortId: row.short_id,
    answers: row.answers,
    contentVersion: row.content_version,
    comment: row.withdrawn_at ? null : row.comment,
    verificationLevel: row.verification_level,
    verifiedAt: iso(row.verified_at),
    withdrawn: Boolean(row.withdrawn_at),
    createdAt: iso(row.created_at)!,
    name,
    isPoc: row.is_poc,
    isSeed: row.is_seed,
  };
}

/** Cachovaná varianta pro stránky. Po změně volat revalidateTag(signatureTag(id), …). */
export function getPublicSignature(id: string): Promise<PublicSignature | null> {
  return unstable_cache(() => loadPublicSignature(getSql(), id), ["public-signature-v2", id], {
    tags: [signatureTag(id)],
    revalidate: 3600,
  })();
}
