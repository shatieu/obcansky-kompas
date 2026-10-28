"use client";

import { Fragment, lazy, Suspense, useState, type ReactNode } from "react";
import type { CompassState } from "@/lib/compass-storage";
import type { LookupTexts } from "@/lib/sign/lookup-texts";
import type { LoadedSignature } from "./answers-loader";

/** Okno se stáhne až po klepnutí (JS /kompas ≤ 150 kB, SPEC §4.6). */
const AnswersLoader = lazy(() => import("./answers-loader"));

/**
 * Malý odkaz „Načíst moje odpovědi“ – po klepnutí líně načte okno pro číslo podpisu / odkaz z
 * e-mailu (components/lookup/answers-loader.tsx). Po úspěchu jsou odpovědi v localStorage.
 */
export function AnswersLoaderLink({
  texts,
  onLoaded,
  className,
}: {
  texts: LookupTexts;
  onLoaded?: (state: CompassState, sig: LoadedSignature) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      {open ? (
        <Suspense fallback={<p className="k-cap">{texts.loading}</p>}>
          <AnswersLoader texts={texts} onLoaded={onLoaded} onClose={() => setOpen(false)} />
        </Suspense>
      ) : (
        <button type="button" className="k-link" onClick={() => setOpen(true)}>
          {texts.link}
        </button>
      )}
    </div>
  );
}

/**
 * Pro stránky, které čtou odpovědi z prohlížeče jen při připojení (/akce): po načtení odpovědí
 * znovu připojí `children` (nový `key`), okno s potvrzením zůstane. Serverová stránka tak nemusí
 * předávat funkci.
 */
export function AnswersLoaderRemount({ texts, children, className }: { texts: LookupTexts; children: ReactNode; className?: string }) {
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <Fragment key={generation}>{children}</Fragment>
      <div className="k-wrap">
        <AnswersLoaderLink texts={texts} className={className ?? "mx-auto max-w-main pb-4"} onLoaded={() => setGeneration((g) => g + 1)} />
      </div>
    </>
  );
}
