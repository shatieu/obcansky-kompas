import type { ReactNode } from "react";
import s from "./sign.module.css";

/** Celá vlajka 3:2 (viewBox 900×600) – jen uvnitř výběrové značky a FlagUnfold. */
export function FlagPaths({ classes }: { classes?: { white?: string; red?: string; blue?: string } }) {
  return (
    <>
      <rect className={classes?.white} x="0" y="0" width="900" height="300" fill="#FFFFFF" />
      <rect className={classes?.red} x="0" y="300" width="900" height="300" fill="#D7141A" />
      <path className={classes?.blue} d="M0 0L450 300 0 600z" fill="#11457E" />
    </>
  );
}

/**
 * Zaškrtávací pole s výběrovou značkou (SelectMark) místo fajfky – design system zakazuje fajfky.
 * Nativní checkbox zůstává (přístupnost, formulář bez JS), jen vizuálně skrytý.
 */
export function CheckField({
  name,
  checked,
  onChange,
  required,
  children,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className={`${s.row} flex min-h-14 cursor-pointer items-start gap-4 py-3`}>
        <input
          type="checkbox"
          name={name}
          className={s.check}
          checked={checked}
          required={required}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={s.mark} aria-hidden>
          <svg viewBox="0 0 900 600">
            <FlagPaths />
          </svg>
        </span>
        <span className="pt-0.5 text-[17px] leading-[26px]">{children}</span>
      </label>
      {hint ? <div className="-mt-2 pl-11 text-[15px] leading-[22px] text-muted">{hint}</div> : null}
    </div>
  );
}
