import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./format";
import { Icon, type IconName } from "./icon";

/** Seznam akcí (řádky s linkou, ne řada tlačítek). */
export function ActionList({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul className={cx("k-actionlist", className)} aria-label={label}>
      {children}
    </ul>
  );
}

type RowCommon = { icon?: IconName; iconEnd?: IconName; children: ReactNode };

/** Řádek akce jako odkaz (<li> je součástí). */
export function ActionLink({ icon, iconEnd = "chevron-right", children, className, ...rest }: RowCommon & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <li>
      <a className={cx("k-action", className)} {...rest}>
        <span className="k-action__main">
          {icon && <Icon name={icon} />}
          <span>{children}</span>
        </span>
        <Icon name={iconEnd} />
      </a>
    </li>
  );
}

/** Řádek akce jako tlačítko (<li> je součástí). */
export function ActionButton({
  icon,
  iconEnd = "chevron-right",
  children,
  className,
  type = "button",
  ...rest
}: RowCommon & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <li>
      <button type={type} className={cx("k-action", className)} {...rest}>
        <span className="k-action__main">
          {icon && <Icon name={icon} />}
          <span>{children}</span>
        </span>
        <Icon name={iconEnd} />
      </button>
    </li>
  );
}
