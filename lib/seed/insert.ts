import type postgres from "postgres";
import { CONTENT_VERSION } from "@/lib/content";
import { emailHmac, encrypt, sha256Hex } from "@/lib/crypto";
import { generateShortId } from "@/lib/sign/short-id";
import type { SeedOrganization, SeedSignature } from "./generate";

/** Zapíše seed do DB (idempotentně: nejdřív smaže předchozí seed). */
export async function insertSeed(
  sql: postgres.Sql,
  data: { signatures: SeedSignature[]; organizations: SeedOrganization[] },
): Promise<void> {
  await sql.begin(async (tx) => {
    await clearSeed(tx);
    // Číslo podpisu i pro seed (náhodné jako u skutečných podpisů; v dávce bez opakování).
    const shortIds = new Set<string>();
    const nextShortId = () => {
      let id = generateShortId();
      while (shortIds.has(id)) id = generateShortId();
      shortIds.add(id);
      return id;
    };
    const sigRows = data.signatures.map((s) => ({
      id: s.id,
      short_id: nextShortId(),
      answers: s.answers as unknown as postgres.JSONValue,
      content_version: CONTENT_VERSION,
      region: s.region,
      age_group: s.ageGroup,
      municipality_size: s.municipalitySize,
      comment: s.comment,
      verification_level: s.verified ? "email" : "unverified",
      verified_at: s.verifiedAt,
      is_seed: true,
      is_poc: false,
      created_at: s.createdAt,
    }));
    const signerRows = data.signatures.map((s) => ({
      signature_id: s.id,
      name_enc: encrypt(s.signer.name),
      show_name: s.signer.showName,
      email_enc: encrypt(s.signer.email),
      email_hmac: emailHmac(s.signer.email),
      address_enc: null,
      consent_at: s.createdAt,
    }));
    for (let i = 0; i < sigRows.length; i += 100) {
      const chunk = sigRows.slice(i, i + 100).map((r) => ({ ...r, answers: tx.json(r.answers) }));
      await tx`insert into app.signature ${tx(chunk)}`;
      await tx`insert into app.signer ${tx(signerRows.slice(i, i + 100))}`;
    }
    for (const o of data.organizations) {
      await tx`
        insert into app.organization (name, type, contact, token_hash, submitted_at, answers, justifications, is_seed)
        values (
          ${o.name}, ${o.type}, ${"ukazka@example.invalid"}, ${sha256Hex(`seed-org:${o.name}`)},
          ${o.submitted ? new Date().toISOString() : null},
          ${o.answers ? tx.json(o.answers as postgres.JSONValue) : null},
          ${o.justifications ? tx.json(o.justifications) : null},
          true
        )`;
    }
  });
}

export async function clearSeed(sql: postgres.Sql | postgres.TransactionSql): Promise<{ signatures: number; organizations: number }> {
  const s = await sql`delete from app.signature where is_seed`;
  const o = await sql`delete from app.organization where is_seed`;
  return { signatures: s.count, organizations: o.count };
}
