import { krajCodes, loadObceForKraj } from "@/components/akce/load-directories";

/**
 * Obce jednoho kraje jako statický JSON (vzniká při buildu, servíruje CDN).
 * /akce ho stahuje až po výběru kraje, takže 1,3 MB adresáře obcí není v JS stránky.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return krajCodes().map((kraj) => ({ kraj }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ kraj: string }> }) {
  const { kraj } = await params;
  return Response.json(loadObceForKraj(kraj), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
