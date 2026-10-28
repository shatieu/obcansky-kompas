import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./format";
import { Icon, type IconName } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "inverse" | "inverse-outline";
type ForcedState = "hover" | "focus" | "active";

interface Common {
  variant?: ButtonVariant;
  /** Přes celou šířku (na mobilu ve StickyBar). */
  block?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  /** Vynucený stav pro dokumentaci. */
  state?: ForcedState;
}

/** Třídy tlačítka – pro prvky, které nejsou <button>/<a> (např. <label> výběru souboru). */
export function buttonClass({ variant = "primary", block = false, iconEnd }: Pick<Common, "variant" | "block" | "iconEnd">, className?: string) {
  return cx("k-btn", "k-btn--" + variant, block && "k-btn--block", block && iconEnd && "k-btn--between", className);
}

/** Tlačítko: sloveso + arrow-right. Jedno primární na obrazovku, nejvýš jedno sekundární textové. */
export function Button({
  variant = "primary",
  block = false,
  icon,
  iconEnd,
  state,
  className,
  children,
  type = "button",
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} data-state={state} className={buttonClass({ variant, block, iconEnd }, className)} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {iconEnd && <Icon name={iconEnd} />}
    </button>
  );
}

/** Odkaz, který vypadá jako tlačítko (navigace na jinou stránku). Obyčejné <a>, bez routeru. */
export function ButtonLink({
  variant = "primary",
  block = false,
  icon,
  iconEnd,
  state,
  className,
  children,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a data-state={state} className={buttonClass({ variant, block, iconEnd }, className)} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {iconEnd && <Icon name={iconEnd} />}
    </a>
  );
}

/**
 * Primární akce přilepená dole přes celou šířku (mobil), v toku na desktopu (≥ 768 px).
 * Předpokládá rodiče s 16px okrajem (.k-wrap) – na mobilu se roztáhne přes něj.
 */
export function StickyBar({ children, static: isStatic, className }: { children: ReactNode; static?: boolean; className?: string }) {
  return (
    <div className={cx("k-sticky", className)} style={isStatic ? { position: "relative" } : undefined}>
      {children}
    </div>
  );
}

/** Ikonové tlačítko 48 × 48 (zavřít, −/+). */
export function IconButton({
  icon,
  label,
  className,
  type = "button",
  ...rest
}: { icon: IconName; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button type={type} className={cx("k-iconbtn", className)} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** Textový odkaz s ikonou (sekundární navigace, zdroje). */
export function TextLink({ icon, children, className, ...rest }: { icon?: IconName } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cx("k-link", className)} {...rest}>
      {children}
      {icon && <Icon name={icon} size={18} />}
    </a>
  );
}
