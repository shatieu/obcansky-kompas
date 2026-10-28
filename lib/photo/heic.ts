/**
 * Záložní dekodér HEIC/HEIF (fotky z iPhonu) pro prohlížeče, které HEIC neumí
 * (Chrome, Firefox, Android). Safari HEIC dekóduje samo, tam se tento modul nenačte.
 *
 * Balíček `heic-to` (libheif ve WebAssembly, ~několik MB) se stahuje líně, jen když
 * uživatel vybere HEIC a nativní dekódování selže. Varianta `/csp` nepotřebuje
 * `unsafe-eval`, takže projde striktní CSP (SPEC §14.3).
 *
 * Fotka se převádí v prohlížeči, nikam se neposílá.
 */

interface HeicToModule {
  heicTo(args: { blob: Blob; type: "image/jpeg" | "image/png"; quality?: number }): Promise<Blob>;
}

let modPromise: Promise<HeicToModule> | null = null;

function loadDecoder(): Promise<HeicToModule> {
  modPromise ??= (async () => {
    // Volitelná závislost: dokud není v package.json, typ se nenajde (proto @ts-ignore,
    // ne @ts-expect-error – po instalaci by ten zase selhal).
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- viz výše
    // @ts-ignore -- heic-to se doplňuje do package.json zvlášť
    const mod = (await import("heic-to/csp")) as unknown as HeicToModule;
    return mod;
  })().catch((e: unknown) => {
    modPromise = null; // další pokus může uspět (např. po výpadku sítě)
    throw e;
  });
  return modPromise;
}

/** Převede HEIC na JPEG (bez metadat; výsledek se stejně ještě kreslí do canvasu). */
export async function heicToJpeg(blob: Blob): Promise<Blob> {
  const { heicTo } = await loadDecoder();
  return heicTo({ blob, type: "image/jpeg", quality: 0.95 });
}
