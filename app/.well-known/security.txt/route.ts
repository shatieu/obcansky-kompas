/**
 * /.well-known/security.txt podle RFC 9116 (SPEC §13). Statický.
 * TODO(owner): nahradit kontaktní e-mail skutečnou adresou spolku a před vypršením
 * (Expires, max. 1 rok dopředu) prodloužit.
 */
export const dynamic = "force-static";

const SECURITY_CONTACT = "mailto:security@example.invalid";
const SECURITY_EXPIRES = "2027-10-27T23:00:00.000Z";

export function GET(): Response {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const lines = [
    "# Občanský kompas – hlášení zranitelností",
    "# TODO(owner): kontakt je zatím zástupný, doplní spolek.",
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${SECURITY_EXPIRES}`,
    "Preferred-Languages: cs, en",
    ...(site ? [`Canonical: ${site}/.well-known/security.txt`] : []),
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
