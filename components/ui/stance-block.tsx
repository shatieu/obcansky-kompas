import type { ReactNode } from "react";
import { ButtonLink } from "./button";
import { Kicker } from "./typography";

/**
 * „Kde stojíme my“ – jediný blok, který zaujímá postoj; plná modrá plocha, jasně oddělená od kvízu.
 * Jeho dvojice tlačítek je jediná povolená výjimka z pravidla „jedno primární“.
 */
export function StanceBlock({
  kicker = "Kde stojíme my",
  text,
  by,
  primary,
  secondary,
  ariaLabel,
  extra,
}: {
  kicker?: string;
  text: string;
  by?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  ariaLabel?: string;
  /** Doplněk pod dvojicí tlačítek (online demonstrace: odkaz a živý počet účastníků). */
  extra?: ReactNode;
}) {
  return (
    <section className="k-stance" aria-label={ariaLabel ?? kicker}>
      <div className="mx-auto max-w-content">
        <Kicker as="div">
          <h2>{kicker}</h2>
        </Kicker>
        <p className="k-stance__text k-h k-h1">{text}</p>
        <div className="k-stance__actions">
          <ButtonLink href={primary.href} variant="inverse" block iconEnd="arrow-right">
            {primary.label}
          </ButtonLink>
          {secondary && (
            <ButtonLink href={secondary.href} variant="inverse-outline" block iconEnd="arrow-right">
              {secondary.label}
            </ButtonLink>
          )}
        </div>
        {extra}
        {by && <p className="k-stance__by">{by}</p>}
      </div>
    </section>
  );
}
