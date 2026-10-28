import { FlagPaths } from "./select-mark";
import s from "./sign.module.css";

/**
 * Potvrzení podpisu (design system FlagUnfold, SPEC §4.5): noční plocha přes obrazovku, vlajka 3:2
 * se rozvine za 800 ms, zpráva až pod ní. Bez smyčky; s prefers-reduced-motion rovnou konečný stav.
 */
export function FlagUnfold({ title, text, onContinue, continueLabel }: { title: string; text: string; onContinue: () => void; continueLabel: string }) {
  return (
    <div className={s.unfold} role="status" aria-live="polite" onClick={onContinue}>
      <svg className={s.flag} viewBox="0 0 900 600" aria-hidden>
        <FlagPaths classes={{ white: s.fWhite, red: s.fRed, blue: s.fBlue }} />
      </svg>
      <div className={s.msg}>
        <h1 className="text-[38px] font-extrabold leading-10 md:text-7xl md:leading-[72px]">{title}</h1>
        <p className="mt-3 text-[17px] leading-[26px]">{text}</p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-8 inline-flex min-h-[60px] items-center gap-3 border-2 border-current px-6 text-lg font-bold"
        >
          {continueLabel}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
