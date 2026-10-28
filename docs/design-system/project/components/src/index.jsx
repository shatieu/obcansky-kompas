// Občanský kompas — reference components (React 18). Built to components/bundle.js as window.Kompas.
const React = window.React;
const { useState, useId } = React;

const cx = (...a) => a.filter(Boolean).join(' ');
const NB = ' ';
/** Czech number: 12480 -> "12 480", 9.2 -> "9,2" */
export function formatCz(n, digits = 0) {
  const s = Number(n).toFixed(digits).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  return s.join(',');
}

/* ---------------- Icon ---------------- */
const PATHS = {
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  'chevron-left': 'M15 5l-7 7 7 7',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  close: 'M5 5l14 14M19 5L5 19',
  info: 'M12 10.5V17M12 7v.01M3 3h18v18H3z',
  alert: 'M12 7v6.5M12 16.5v.01M3 3h18v18H3z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  mail: 'M3 5h18v14H3zM3 5l9 8 9-8',
  share: 'M12 15V3M7 8l5-5 5 5M5 12v9h14v-9',
  compare: 'M4 7h11M4 17h16M19 4v6M15 14v6',
  law: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
};
export function Icon({ name, size = 24, title, className }) {
  return (
    <svg className={cx('k-icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

/* ---------------- Flag — always 3:2, always alone ---------------- */
const FLAG_PATHS = (
  <>
    <rect className="f-white" x="0" y="0" width="900" height="300" />
    <rect className="f-red" x="0" y="300" width="900" height="300" />
    <path className="f-blue" d="M0 0L450 300 0 600z" />
  </>
);
/** The Czech flag. Width only — height is always width × 2/3. A 1px flag-edge outline sits outside it. Nothing may overlap it. */
export function Flag({ width = '100%', animate = false, unfold = false, label = 'Česká vlajka', delays }) {
  const st = delays ? (k) => ({ animationDelay: delays[k] + 'ms', animationPlayState: 'paused' }) : () => undefined;
  return (
    <svg className={cx('k-flag', animate && 'k-flag--animate', unfold && 'k-flag--unfold')} style={{ width }} viewBox="0 0 900 600" role={label ? 'img' : undefined} aria-hidden={label ? undefined : true} aria-label={label || undefined}>
      <rect className="f-white" x="0" y="0" width="900" height="300" style={st('stripes')} />
      <rect className="f-red" x="0" y="300" width="900" height="300" style={st('stripes')} />
      <path className="f-blue" d="M0 0L450 300 0 600z" style={st('wedge')} />
    </svg>
  );
}
export const FlagHero = (p) => <Flag animate {...p} />;
export function Wordmark({ href = '#' }) {
  return <a className="k-wordmark" href={href}><Flag width={24} label="" />Občanský kompas</a>;
}
/** Selection mark: a whole 3:2 flag inside a circle when on, an empty ring when off. */
export function SelectMark({ on = false }) {
  return (
    <span className={cx('k-mark', on && 'k-mark--on')} aria-hidden="true">
      <svg viewBox="0 0 900 600">{FLAG_PATHS}</svg>
    </span>
  );
}
export function FlagUnfold({ title = 'Podepsáno.', text = 'Díky. Tvůj hlas je započítaný.', still, fixed = false }) {
  const t = still == null ? null : still; // ms frame for documentation
  const delays = t == null ? null : { wedge: -t, stripes: 150 - t };
  return (
    <div className={cx('k-unfold', 'k-night', fixed && 'k-unfold--fixed')} role="status" aria-live="polite">
      <div className="k-unfold__flag"><Flag unfold delays={delays} label="" /></div>
      <div className="k-unfold__msg" style={t == null ? undefined : { animationDelay: (600 - t) + 'ms', animationPlayState: 'paused' }}><h2 className="display">{title}</h2><p>{text}</p></div>
    </div>
  );
}

/* ---------------- Button ---------------- */
export function Button({ variant = 'primary', block = false, icon, iconEnd, state, className, children, ...rest }) {
  return (
    <button type="button" data-state={state} className={cx('k-btn', 'k-focusable', 'k-btn--' + variant, block && 'k-btn--block', block && iconEnd && 'k-btn--between', className)} {...rest}>
      {icon && <Icon name={icon} />}<span>{children}</span>{iconEnd && <Icon name={iconEnd} />}
    </button>
  );
}
export function StickyBar({ children, static: isStatic }) {
  return <div className="k-sticky" style={isStatic ? { position: 'relative' } : undefined}>{children}</div>;
}

/* ---------------- Answer option ---------------- */
export function AnswerOption({ label, selected = false, disabled = false, conflict, multiple = false, state, onSelect, onExplain, children }) {
  const onClick = () => (disabled ? onExplain && onExplain() : onSelect && onSelect());
  return (
    <button type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={selected} aria-disabled={disabled || undefined} data-state={state}
      className="k-opt k-focusable" onClick={onClick}>
      <SelectMark on={selected} />
      <span className="k-opt__text">
        <span>{label}</span>
        {disabled && conflict && <><br /><span className="k-opt__tag">Nejde s: {conflict}</span></>}
        {children}
      </span>
      {disabled && <span className="k-opt__aside"><Icon name="info" title="Proč to nejde?" /></span>}
    </button>
  );
}
export function AnswerGroup({ legend, lede, error, children }) {
  const id = useId();
  return (
    <fieldset className={cx('k-group', error && 'k-group--error')} role="radiogroup" aria-labelledby={id} aria-invalid={error ? true : undefined}>
      <legend className="k-group__legend" id={id}><span className="h1 k-h" style={{ display: 'block' }}>{legend}</span>{lede && <span className="k-lede" style={{ display: 'block' }}>{lede}</span>}</legend>
      {error && <p className="k-error" role="alert"><Icon name="alert" />{error}</p>}
      {children}
    </fieldset>
  );
}

/* ---------------- Disclosure + bottom sheet ---------------- */
export function Disclosure({ label = 'Co to znamená?', open = false, mode = 'sheet', state, onToggle, children }) {
  const id = useId();
  return (
    <div>
      <button type="button" className="k-disc k-focusable" data-state={state} aria-expanded={mode === 'inline' ? open : undefined} aria-haspopup={mode === 'sheet' ? 'dialog' : undefined} aria-controls={mode === 'inline' ? id : undefined} onClick={onToggle}>
        <span className="k-disc__q" aria-hidden="true">?</span><span className="k-disc__label">{label}</span>
        <Icon name={mode === 'inline' ? (open ? 'minus' : 'plus') : 'arrow-right'} />
      </button>
      {mode === 'inline' && open && <div className="k-disc__panel" id={id}>{children}</div>}
    </div>
  );
}
export function BottomSheet({ open = true, title, lines = [], sources = [], onClose, fixed = false }) {
  const id = useId();
  if (!open) return null;
  return (
    <>
      <div className={cx('k-scrim', fixed && 'k-scrim--fixed')} onClick={onClose} />
      <div className={cx('k-sheet', fixed && 'k-sheet--fixed')} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="k-sheet__head">
          <h2 className="h2" id={id}>{title}</h2>
          <button type="button" className="k-iconbtn k-focusable" onClick={onClose} aria-label="Zavřít"><Icon name="close" /></button>
        </div>
        <ol className="k-sheet__lines">{lines.slice(0, 4).map((l, i) => <li key={i}>{l}</li>)}</ol>
        {sources.length > 0 && (
          <ul className="k-sheet__src" aria-label="Zdroje" style={{ listStyle: 'none' }}>
            {sources.map((s, i) => <li key={i}><a className="k-link k-focusable" href={s.href || '#'}>{s.label}<Icon name="external" size={18} /></a></li>)}
          </ul>
        )}
      </div>
    </>
  );
}

/* ---------------- Budget slider ---------------- */
/** The callout rides on top of the handle and always says where you are relative to the nearest anchor; it snaps to anchors. */
export function BudgetSlider({ value: v0 = 9.2, min = 5, max = 12, step = 0.1, snap = 0.15, anchors = [], adults = 9.02e6, unit = 'mld', onChange, label = 'Roční rozpočet ČT a ČRo' }) {
  const [v, setV] = useState(v0);
  const set = (x) => {
    let n = Math.round(Math.min(max, Math.max(min, x)) * 10) / 10;
    const near = anchors.find((a) => Math.abs(a.value - n) <= snap + 1e-9);
    if (near) n = near.value;
    setV(n); onChange && onChange(n);
  };
  const nudge = (d) => { const n = Math.round(Math.min(max, Math.max(min, v + d)) * 10) / 10; setV(n); onChange && onChange(n); };
  const perMonth = Math.round((v * 1e9) / 12 / adults);
  const pct = (x) => ((x - min) / (max - min)) * 100;
  const hit = anchors.find((a) => Math.abs(a.value - v) < 1e-9);
  const nearest = anchors.slice().sort((a, b) => Math.abs(a.value - v) - Math.abs(b.value - v))[0];
  const diff = nearest ? Math.round((v - nearest.value) * 10) / 10 : 0;
  const say = hit ? `${hit.label}` : nearest ? `${nearest.label} ${diff > 0 ? '+' : '−'}${NB}${formatCz(Math.abs(diff), 1)}${NB}${unit}` : '';
  const p = pct(v);
  const id = useId();
  return (
    <div className="k-budget">
      <p className="k-budget__value"><span className="stat-l">{formatCz(v, 1)}{NB}{unit}</span><span className="k-budget__unit">Kč ročně</span></p>
      <div className="k-budget__ctrl">
        <button type="button" className="k-iconbtn k-focusable" aria-label="Méně o 100 milionů" onClick={() => nudge(-step)} disabled={v <= min}><Icon name="minus" /></button>
        <div className="k-budget__track">
          {nearest && (
            <div className={cx('k-callout', hit && 'k-callout--hit')} style={{ left: `calc(14px + (100% - 28px) * ${p / 100})`, ['--shift']: `-${p}%`, ['--tip']: `${p}%` }} aria-hidden="true">
              <span className="k-callout__box">{hit ? <><b>{hit.label}</b></> : <><b>{nearest.label}</b>{` ${diff > 0 ? '+' : '−'}${NB}${formatCz(Math.abs(diff), 1)}${NB}${unit}`}</>}</span>
              <span className="k-callout__tip" />
            </div>
          )}
          <label htmlFor={id} className="k-sr">{label}</label>
          <input id={id} className="k-range" type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(parseFloat(e.target.value))} aria-valuetext={`${formatCz(v, 1)} miliardy korun ročně, ${say}`} />
          <div className="k-budget__rail">
            {anchors.map((a) => (
              <button type="button" key={a.label} className="k-notch" data-hit={hit === a} style={{ left: pct(a.value) + '%' }} aria-label={`Nastavit na ${a.label}: ${formatCz(a.value, 1)} miliardy`} onClick={() => set(a.value)} />
            ))}
          </div>
        </div>
        <button type="button" className="k-iconbtn k-focusable" aria-label="Více o 100 milionů" onClick={() => nudge(step)} disabled={v >= max}><Icon name="plus" /></button>
      </div>
      <p className="k-budget__live k-num" aria-live="polite">≈{NB}{formatCz(perMonth)}{NB}Kč měsíčně na dospělého<span className="k-sr">. {say}</span></p>
    </div>
  );
}

/* ---------------- Progress ---------------- */
export function ProgressBar({ total = 8, current = 1, label = true }) {
  const segs = Array.from({ length: total }, (_, i) => (i + 1 < current ? 'done' : i + 1 === current ? 'current' : 'todo'));
  return (
    <div>
      <ol className="k-progress" aria-label={`Otázka ${current} z ${total}`}>
        {segs.map((s, i) => <li key={i} data-s={s}><span className="k-sr">{`Otázka ${i + 1}: ${s === 'done' ? 'hotovo' : s === 'current' ? 'právě teď' : 'zbývá'}`}</span></li>)}
      </ol>
      {label && <div className="k-progress__label"><span className="kicker">Otázka {current} z {total}</span><span className="k-progress__count k-num">{String(current).padStart(2, '0')}/{String(total).padStart(2, '0')}</span></div>}
    </div>
  );
}

/* ---------------- Form controls ---------------- */
function FieldError({ children }) {
  return <span className="k-field__err" role="alert"><Icon name="alert" />{children}</span>;
}
export function TextInput({ label, hint, error, disabled, state, value, placeholder, type = 'text', ...rest }) {
  const id = useId();
  return (
    <div className={cx('k-field', disabled && 'k-field--disabled')}>
      <label className="k-field__label" htmlFor={id}>{label}</label>
      {hint && <span className="k-field__hint" id={id + 'h'}>{hint}</span>}
      <input id={id} className="k-input" data-state={state} type={type} defaultValue={value} placeholder={placeholder} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={hint ? id + 'h' : undefined} {...rest} />
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
export function Select({ label, options = [], value, error, disabled, state, placeholder = 'Vyber…' }) {
  const id = useId();
  return (
    <div className={cx('k-field', disabled && 'k-field--disabled')}>
      <label className="k-field__label" htmlFor={id}>{label}</label>
      <div className="k-selectwrap">
        <select id={id} className="k-select" data-state={state} defaultValue={value || ''} disabled={disabled} aria-invalid={error ? true : undefined}>
          <option value="" disabled>{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Icon name="chevron-down" />
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
export function Checkbox({ label, checked = false, error, disabled, state, children }) {
  const [c, setC] = useState(checked);
  return (
    <div>
      <label className={cx('k-check', error && 'k-check--error', disabled && 'k-check--disabled')} data-state={state}>
        <input type="checkbox" checked={c} disabled={disabled} onChange={(e) => setC(e.target.checked)} aria-invalid={error ? true : undefined} />
        <SelectMark on={c} />
        <span>{label}{children}</span>
      </label>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
export function Toggle({ label, checked = false, hint }) {
  const [c, setC] = useState(checked);
  return (
    <button type="button" role="switch" aria-checked={c} className="k-toggle k-focusable" onClick={() => setC(!c)}>
      <span><span style={{ display: 'block', fontWeight: 600 }}>{label}</span>{hint && <span className="k-field__hint" style={{ display: 'block' }}>{hint}</span>}</span>
      <span className="k-toggle__track" aria-hidden="true"><span className="k-toggle__knob" /><span className="k-toggle__state">{c ? 'ANO' : 'NE'}</span></span>
    </button>
  );
}
export function StepSlider({ label, steps = [], value = 0, onChange }) {
  const [v, setV] = useState(value);
  return (
    <fieldset className="k-steps">
      <legend className="k-field__label">{label}</legend>
      <div className="k-steps__rail" role="radiogroup">
        {steps.map((s, i) => (
          <button type="button" key={s} role="radio" aria-checked={v === i} className="k-steps__opt" onClick={() => { setV(i); onChange && onChange(i); }}>{s}</button>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------------- Bar chart ---------------- */
export function BarChart({ title, data = [], total, unit = '%', foot, headingLevel = 3 }) {
  const H = 'h' + headingLevel;
  const sum = total || data.reduce((a, d) => a + d.value, 0);
  return (
    <figure className="k-chart">
      {title && <H className="h3 k-chart__title">{title}</H>}
      <ol className="k-chart__list">
        {data.map((d) => {
          const p = unit === '%' ? Math.round((d.value / sum) * 100) : d.value;
          const w = unit === '%' ? p : (d.value / Math.max(...data.map((x) => x.value))) * 100;
          const txt = (<><span>{d.label}</span><span className="k-bar__val">{formatCz(p)}{NB}{unit}</span></>);
          return (
            <li key={d.label} className="k-bar">
              <span className="k-bar__fill" style={{ width: w + '%' }} />
              <span className="k-bar__text">{txt}</span>
              <span className="k-bar__text k-bar__text--on" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - w}% 0 0)` }}>{txt}</span>
            </li>
          );
        })}
      </ol>
      {foot && <figcaption className="k-chart__foot">{foot}</figcaption>}
    </figure>
  );
}

/* ---------------- Stance block ---------------- */
export function StanceBlock({ kicker = 'Kde stojíme my', text, by, primary = 'Napsat zástupcům', secondary = 'Profilová fotka', onPrimary, onSecondary }) {
  return (
    <section className="k-stance" aria-label={kicker}>
      <p className="k-kicker">{kicker}</p>
      <p className="k-stance__text h1">{text}</p>
      <div className="k-stance__actions">
        <Button variant="inverse" block iconEnd="arrow-right" onClick={onPrimary}>{primary}</Button>
        <Button variant="inverse-outline" block iconEnd="arrow-right" onClick={onSecondary}>{secondary}</Button>
      </div>
      {by && <p className="k-stance__by">{by}</p>}
    </section>
  );
}

/* ---------------- Sample marking ---------------- */
export function SampleBadge({ children = 'Ukázkový režim' }) { return <span className="k-badge">{children}</span>; }
export function SampleBanner({ title = 'Ukázková data', text = 'Čísla nejsou skutečná.' }) {
  return <div className="k-banner" role="note"><strong>{title}</strong><span>{text}</span></div>;
}

/* ---------------- "Můj text" ---------------- */
export function StatementPreview({ open = false, paragraphs = [], label = 'Můj text', onToggle }) {
  const [o, setO] = useState(open);
  const peek = (paragraphs[0] || '').replace(/<[^>]+>/g, '');
  return (
    <div className="k-mytext">
      <button type="button" className="k-mytext__row k-focusable" aria-expanded={o} onClick={() => { setO(!o); onToggle && onToggle(!o); }}>
        <span className="k-mytext__k">{label}</span>
        {!o && <span className="k-mytext__peek">{peek}</span>}
        {o && <span style={{ flex: 1 }} />}
        <Icon name={o ? 'minus' : 'plus'} />
      </button>
      {o && <div className="k-mytext__body">{paragraphs.map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p }} />)}</div>}
    </div>
  );
}

/* ---------------- Profile photo frame ---------------- */
const S = 1080, R = 540;
const NAVY = '#0B1B33', FB = '#11457E', FR = '#D7141A';
/** A whole 3:2 flag in SVG user units, with its outline and clear space plate behind it. */
function FlagAt({ x, y, w, plate = true, edge = NAVY }) {
  const h = (w * 2) / 3, pad = h / 4, sw = Math.max(2, w / 120);
  return (
    <g>
      {plate && <rect x={x - pad} y={y - pad} width={w + pad * 2} height={h + pad * 2} fill="#FFFFFF" />}
      <rect x={x} y={y} width={w} height={h / 2} fill="#FFFFFF" />
      <rect x={x} y={y + h / 2} width={w} height={h / 2} fill={FR} />
      <path d={`M${x} ${y}L${x + w / 2} ${y + h / 2} ${x} ${y + h}z`} fill={FB} />
      <rect x={x - sw / 2} y={y - sw / 2} width={w + sw} height={h + sw} fill="none" stroke={edge} strokeWidth={sw} />
    </g>
  );
}
function PhotoBase({ photo, uid }) {
  return (
    <g clipPath={`url(#c${uid})`}>
      <rect width={S} height={S} fill="#E8EEF6" />
      {photo ? <image href={photo} width={S} height={S} preserveAspectRatio="xMidYMid slice" /> :
        <text x={R} y={R + 20} textAnchor="middle" fontSize="60" fontWeight="700" fill="#454E5D">Tvoje fotka</text>}
    </g>
  );
}
export function PhotoFrame({ variant = 'ring', slogan = 'Ruce pryč od médií', photo, size = 280, label }) {
  const uid = useId().replace(/:/g, '');
  const up = slogan.toUpperCase();
  let art;
  if (variant === 'ring') {
    art = (
      <>
        <PhotoBase photo={photo} uid={uid} />
        <path d={`M${R - 470} ${R}A470 470 0 0 1 ${R + 470} ${R}`} fill="none" stroke={FB} strokeWidth="140" />
        <path d={`M${R - 470} ${R}A470 470 0 0 0 ${R + 470} ${R}`} fill="none" stroke={FR} strokeWidth="140" />
        <circle cx={R} cy={R} r="394" fill="none" stroke="#FFFFFF" strokeWidth="14" />
        <path d={`M${R - 470} ${R}h140M${R + 330} ${R}h140`} stroke="#FFFFFF" strokeWidth="14" />
        <path id={`a${uid}`} d={`M${R - 462} ${R}A462 462 0 0 1 ${R + 462} ${R}`} fill="none" />
        <text fontSize={up.length > 24 ? 44 : 60} fontWeight="800" fill="#FFFFFF" letterSpacing="2"><textPath href={`#a${uid}`} startOffset="50%" textAnchor="middle" dominantBaseline="central">{up}</textPath></text>
      </>
    );
  } else if (variant === 'ribbon') {
    art = (
      <>
        <PhotoBase photo={photo} uid={uid} />
        <g clipPath={`url(#c${uid})`}>
          <rect y="700" width={S} height="170" fill={FB} />
          <rect y="870" width={S} height="28" fill={FR} />
          <text x={R} y="805" textAnchor="middle" fontSize={up.length > 24 ? 40 : 62} fontWeight="800" fill="#FFFFFF">{up}</text>
        </g>
      </>
    );
  } else if (variant === 'corner') {
    art = (
      <>
        <PhotoBase photo={photo} uid={uid} />
        <FlagAt x={600} y={700} w={240} />
      </>
    );
  } else {
    const words = slogan.split(' ');
    const lines = []; let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > 10 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    lines.push(cur);
    const y0 = 540 - ((lines.length - 1) * 112) / 2 + 30;
    art = (
      <g clipPath={`url(#c${uid})`}>
        <rect width={S} height={S} fill={FB} />
        {photo && <image href={photo} width={S} height={S} preserveAspectRatio="xMidYMid slice" filter={`url(#d${uid})`} />}
        {!photo && <text x={R} y="230" textAnchor="middle" fontSize="44" fontWeight="700" fill="#FFFFFF" opacity=".8">Tvoje fotka v duotónu</text>}
        {lines.map((l, i) => <text key={i} x={R} y={y0 + i * 112} textAnchor="middle" fontSize="104" fontWeight="800" fill="#FFFFFF" letterSpacing="-3">{l.toUpperCase()}</text>)}
        <rect x="390" y={y0 + (lines.length - 1) * 112 + 50} width="300" height="24" fill={FR} />
      </g>
    );
  }
  return (
    <svg className="k-photo" width={size} height={size} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label || `Profilová fotka s rámečkem: ${slogan}`}>
      <defs>
        <clipPath id={`c${uid}`}><circle cx={R} cy={R} r={R} /></clipPath>
        <filter id={`d${uid}`}><feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" /><feComponentTransfer><feFuncR type="table" tableValues="0.067 1" /><feFuncG type="table" tableValues="0.271 1" /><feFuncB type="table" tableValues="0.494 1" /></feComponentTransfer></filter>
      </defs>
      {art}
    </svg>
  );
}

/* ---------------- Share images ---------------- */
const SHARE = { og: [1200, 630], story: [1080, 1920], square: [1080, 1080] };
export function ShareImage({ format = 'og', headline = 'Vím, jak chci financovat veřejnoprávní média', choices = [], scale = 0.4 }) {
  const [W, H] = SHARE[format];
  const F = 'var(--font-wide)';
  const ch = choices.slice(0, 3);
  const Choice = ({ c, i, fs }) => (
    <li style={{ display: 'flex', alignItems: 'center', gap: fs * 0.6, background: '#FFFFFF', color: NAVY, padding: `${fs * 0.5}px ${fs * 0.7}px`, font: `700 ${fs}px/1.2 var(--font-sans)` }}>
      <span style={{ flex: 'none', width: fs * 1.5, height: fs * 1.5, display: 'grid', placeItems: 'center', background: FB, color: '#FFFFFF', font: `800 ${fs * 0.8}px ${F}` }}>{i + 1}</span>{c}
    </li>
  );
  let body;
  if (format === 'og') {
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} fill={NAVY} />
        <FlagAt x={64} y={64} w={180} plate={false} edge="#FFFFFF" />
        <text x={W - 64} y={110} textAnchor="end" fontSize="24" fontWeight="800" fill="#FFFFFF" fontFamily={F}>Občanský kompas</text>
        <foreignObject x="64" y="220" width={W - 128} height="200"><div style={{ font: `800 58px/62px ${F}`, color: '#FFFFFF', letterSpacing: '-1.5px' }}>{headline}</div></foreignObject>
        <foreignObject x="64" y="448" width={W - 128} height="140"><ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>{ch.map((c, i) => <Choice key={i} c={c} i={i} fs={22} />)}</ol></foreignObject>
      </svg>
    );
  } else if (format === 'story') {
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} fill={NAVY} />
        <FlagAt x={88} y={160} w={330} plate={false} edge="#FFFFFF" />
        <foreignObject x="88" y="560" width={W - 176} height="1200">
          <div>
            <div style={{ font: `800 92px/96px ${F}`, color: '#FFFFFF', letterSpacing: '-3px' }}>{headline}</div>
            <ol style={{ margin: '80px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 20 }}>{ch.map((c, i) => <Choice key={i} c={c} i={i} fs={42} />)}</ol>
          </div>
        </foreignObject>
        <text x="88" y={H - 110} fontSize="40" fontWeight="800" fill="#FFFFFF" fontFamily={F}>Občanský kompas</text>
      </svg>
    );
  } else {
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} fill={NAVY} />
        <FlagAt x={80} y={80} w={180} plate={false} edge="#FFFFFF" />
        <text x={W - 80} y={130} textAnchor="end" fontSize="30" fontWeight="800" fill="#FFFFFF" fontFamily={F}>Občanský kompas</text>
        <foreignObject x="80" y="290" width={W - 160} height="720">
          <div>
            <div style={{ font: `800 68px/72px ${F}`, color: '#FFFFFF', letterSpacing: '-2px' }}>{headline}</div>
            <ol style={{ margin: '56px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>{ch.map((c, i) => <Choice key={i} c={c} i={i} fs={34} />)}</ol>
          </div>
        </foreignObject>
      </svg>
    );
  }
  return (
    <div className="k-scaled" style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Obrázek ke sdílení ${W}×${H}: ${headline}`}>
      <div className="k-share" style={{ width: W, height: H, transform: `scale(${scale})` }}>{body}</div>
    </div>
  );
}

/* ---------------- App bar (mockups) ---------------- */
export function AppBar({ sample = true, back, night = false }) {
  return (
    <header className={cx('k-appbar', night && 'k-night')} style={night ? { borderBottomColor: 'transparent' } : undefined}>
      {back ? <button type="button" className="k-back k-focusable"><Icon name="chevron-left" />{back}</button> : <Wordmark />}
      {sample && <SampleBadge />}
    </header>
  );
}
