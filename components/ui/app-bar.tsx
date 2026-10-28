import type { ReactNode } from "react";
import { cx } from "./format";
import { Wordmark } from "./flag";
import { Icon } from "./icon";
import { SampleBadge } from "./sample";

/**
 * Hlavička: Wordmark (nebo „Zpět“) + SampleBadge v ukázkovém režimu. `nav` = odkazy od 768 px,
 * `quick` = jeden kompaktní odkaz jen pod 768 px (tam se `nav` nevejde).
 * Stránka, která začíná noční plochou s atributem `data-night-top`, dostane noční hlavičku přes CSS.
 */
export function AppBar({
  sample = false,
  sampleLabel,
  back,
  backHref,
  night = false,
  nav,
  quick,
  wordmarkLabel,
  wordmarkAria,
}: {
  sample?: boolean;
  sampleLabel?: string;
  /** Popisek zpětného odkazu místo značky. */
  back?: string;
  backHref?: string;
  night?: boolean;
  nav?: ReactNode;
  quick?: ReactNode;
  wordmarkLabel?: string;
  wordmarkAria?: string;
}) {
  return (
    <header className={cx("k-appbar", night && "k-night")}>
      <div className="k-wrap k-appbar__in">
        {back ? (
          <a className="k-back" href={backHref ?? "/"}>
            <Icon name="chevron-left" />
            {back}
          </a>
        ) : (
          <Wordmark label={wordmarkLabel} ariaLabel={wordmarkAria} />
        )}
        <div className="k-appbar__end">
          {quick && <div className="k-appbar__quick">{quick}</div>}
          {nav && <nav className="k-appbar__nav">{nav}</nav>}
          {sample && <SampleBadge>{sampleLabel}</SampleBadge>}
        </div>
      </div>
    </header>
  );
}
