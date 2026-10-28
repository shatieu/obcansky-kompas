"use client";

import {
  useId,
  useRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./format";
import { SelectMark } from "./flag";
import { Icon } from "./icon";

type ForcedState = "hover" | "focus" | "active";

/** Chyba pole: ink text + ikona + 4px linka. */
export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className="k-field__err" role="alert" id={id}>
      <Icon name="alert" />
      <span>{children}</span>
    </span>
  );
}

function describedBy(...ids: (string | false | undefined)[]) {
  const s = ids.filter(Boolean).join(" ");
  return s || undefined;
}

/** Textové pole (56 px, linka 2 px, chyba = 3px okraj + FieldError). */
export function TextInput({
  label,
  hint,
  error,
  state,
  id: idIn,
  className,
  type = "text",
  ...rest
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; state?: ForcedState } & InputHTMLAttributes<HTMLInputElement>) {
  const gen = useId();
  const id = idIn ?? gen;
  return (
    <div className={cx("k-field", rest.disabled && "k-field--disabled", className)}>
      <label className="k-field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="k-field__hint" id={id + "h"}>
          {hint}
        </span>
      )}
      <input
        id={id}
        className="k-input"
        data-state={state}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? id + "h" : undefined, error ? id + "e" : undefined)}
        {...rest}
      />
      {error && <FieldError id={id + "e"}>{error}</FieldError>}
    </div>
  );
}

/** Víceřádkové pole se stejným tvarem jako TextInput. `counter` = text pod polem (zbývá znaků). */
export function TextArea({
  label,
  hint,
  error,
  counter,
  id: idIn,
  className,
  ...rest
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; counter?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const gen = useId();
  const id = idIn ?? gen;
  return (
    <div className={cx("k-field", className)}>
      <label className="k-field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="k-field__hint" id={id + "h"}>
          {hint}
        </span>
      )}
      <textarea
        id={id}
        className="k-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? id + "h" : undefined, counter ? id + "c" : undefined, error ? id + "e" : undefined)}
        {...rest}
      />
      {counter && (
        <span className="k-field__hint k-num" id={id + "c"}>
          {counter}
        </span>
      )}
      {error && <FieldError id={id + "e"}>{error}</FieldError>}
    </div>
  );
}

export type SelectOption = string | { value: string; label: string; disabled?: boolean };

/** Výběr ze seznamu (nativní select, šipka chevron-down). Řízený i neřízený. */
export function Select({
  label,
  hint,
  options = [],
  error,
  state,
  placeholder = "Vyber…",
  placeholderSelectable = false,
  id: idIn,
  className,
  ...rest
}: {
  label: ReactNode;
  hint?: ReactNode;
  options: SelectOption[];
  error?: ReactNode;
  state?: ForcedState;
  /** null = bez prázdné volby. */
  placeholder?: string | null;
  /** Prázdnou volbu jde vybrat (= zrušit výběr). */
  placeholderSelectable?: boolean;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const gen = useId();
  const id = idIn ?? gen;
  const controlled = rest.value !== undefined;
  return (
    <div className={cx("k-field", rest.disabled && "k-field--disabled", className)}>
      <label className="k-field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="k-field__hint" id={id + "h"}>
          {hint}
        </span>
      )}
      <div className="k-selectwrap">
        <select
          id={id}
          className="k-select"
          data-state={state}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint ? id + "h" : undefined, error ? id + "e" : undefined)}
          {...(controlled ? {} : { defaultValue: rest.defaultValue ?? "" })}
          {...rest}
        >
          {placeholder !== null && (
            <option value="" disabled={!placeholderSelectable}>
              {placeholder}
            </option>
          )}
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            );
          })}
        </select>
        <Icon name="chevron-down" />
      </div>
      {error && <FieldError id={id + "e"}>{error}</FieldError>}
    </div>
  );
}

/**
 * Zaškrtávací pole: nativní checkbox (vizuálně skrytý, funguje i ve formuláři bez JS) + SelectMark.
 * Řízené (`checked` + `onChange`) nebo neřízené (`defaultChecked`).
 */
export function Checkbox({
  label,
  caption,
  checked,
  defaultChecked,
  onChange,
  error,
  disabled,
  state,
  name,
  value,
  required,
  id: idIn,
  children,
}: {
  label: ReactNode;
  /** Drobný popisek pod popiskem. */
  caption?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  error?: ReactNode;
  disabled?: boolean;
  state?: ForcedState;
  name?: string;
  value?: string;
  required?: boolean;
  id?: string;
  children?: ReactNode;
}) {
  const gen = useId();
  const id = idIn ?? gen;
  const controlled = checked !== undefined;
  return (
    <div>
      <label className={cx("k-check", error ? "k-check--error" : undefined, disabled && "k-check--disabled")} data-state={state} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name={name}
          value={value}
          required={required}
          {...(controlled ? { checked } : { defaultChecked })}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? id + "e" : undefined}
        />
        <CheckMark />
        <span className="k-check__text">
          {label}
          {caption && <span className="k-check__caption">{caption}</span>}
          {children}
        </span>
      </label>
      {error && <FieldError id={id + "e"}>{error}</FieldError>}
    </div>
  );
}

/** Značka reaguje na :checked sousedního inputu (funguje i bez hydratace). */
function CheckMark() {
  return <span className="k-mark k-mark--css" aria-hidden="true"><MarkFlag /></span>;
}
function MarkFlag() {
  return (
    <svg viewBox="0 0 900 600">
      <rect className="f-white" x="0" y="0" width="900" height="300" />
      <rect className="f-red" x="0" y="300" width="900" height="300" />
      <path className="f-blue" d="M0 0L450 300 0 600z" />
    </svg>
  );
}
// SelectMark se re-exportuje kvůli pohodlí (výběr mimo Checkbox).
export { SelectMark };

/** Přepínač ANO / NE (role="switch"). `name` přidá skrytý input pro formulář. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  name,
  onLabel = "ANO",
  offLabel = "NE",
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <>
      <button type="button" role="switch" aria-checked={checked} className="k-toggle" onClick={() => onChange(!checked)}>
        <span>
          <span className="block font-semibold">{label}</span>
          {hint && <span className="k-field__hint">{hint}</span>}
        </span>
        <span className="k-toggle__track" aria-hidden="true">
          <span className="k-toggle__knob" />
          <span className="k-toggle__state">{checked ? onLabel : offLabel}</span>
        </span>
      </button>
      {name && <input type="hidden" name={name} value={checked ? "1" : ""} />}
    </>
  );
}

/** Posuvník o pevných stupních (typicky 3). Šipky ← → mění stupeň, roving tabindex. */
export function StepSlider({
  label,
  steps,
  value,
  onChange,
}: {
  label: ReactNode;
  steps: string[];
  value: number;
  onChange: (i: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? value + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? value - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(steps.length - 1, next));
    onChange(i);
    refs.current[i]?.focus();
  };
  return (
    <fieldset className="k-steps">
      <legend className="k-field__label">{label}</legend>
      <div className="k-steps__rail" role="radiogroup" onKeyDown={onKey}>
        {steps.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === i}
            tabIndex={value === i ? 0 : -1}
            className="k-steps__opt"
            onClick={() => onChange(i)}
          >
            {s}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
