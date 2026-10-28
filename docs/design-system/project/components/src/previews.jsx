// Preview + screen mockups. Uses window.Kompas (the bundle) only.
const React = window.React;
const { useState } = React;
const K = window.Kompas;
const { Flag, SelectMark, Button, StickyBar, AnswerOption, AnswerGroup, Disclosure, BottomSheet, BudgetSlider, ProgressBar, TextInput, Select, Checkbox, Toggle, StepSlider, BarChart, StanceBlock, SampleBadge, SampleBanner, FlagHero, FlagUnfold, StatementPreview, PhotoFrame, ShareImage, AppBar, Icon, Wordmark } = K;
const NB = ' ';

/* ---------- shared sample content (all labelled Ukázková data) ---------- */
const Q2 = ['Poplatek jako dnes', 'Zvláštní poplatek přes daně', 'Státní rozpočet s pojistkami', 'Návrh vlády', 'Státní rozpočet bez pojistek', 'Jen dobrovolné příspěvky', 'Nevím'];
const Q2DATA = [31, 18, 22, 9, 6, 5, 9].map((v, i) => ({ label: Q2[i], value: v }));
const ANCHORS = [{ value: 7.0, label: 'Návrh vlády' }, { value: 9.2, label: 'Dnes' }, { value: 10.1, label: 'Dnes +10 %' }];
const STANCE = 'Veřejnoprávní média mají mít peníze, na které vláda nemůže sáhnout.';
const STANCE_BY = 'Postoj spolku, který kompas provozuje. Kvíz výše je neutrální.';
const MYTEXT = [
  'Chci, aby ČT a ČRo byly placeny <mark>zvláštním poplatkem vybíraným přes daně</mark>.',
  'Jejich rozpočet má být <mark>9,2 miliardy korun ročně</mark> a nesmí záviset na vůli vlády.',
  'O vedení médií mají rozhodovat <mark>rady volené Sněmovnou i Senátem</mark>.',
];
const SHEET = {
  title: 'Zvláštní poplatek přes daně',
  lines: ['Platí se spolu s daní, ne zvlášť.', 'Peníze jdou rovnou médiím, ne přes rozpočet.', 'Vláda výši nemění bez zákona.', 'Takhle to má například Finsko.'],
  sources: [{ label: 'Zákon o České televizi' }, { label: 'Metodika kompasu' }],
};
const KRAJE = ['Hlavní město Praha', 'Středočeský', 'Jihočeský', 'Plzeňský', 'Karlovarský', 'Ústecký', 'Liberecký', 'Královéhradecký', 'Pardubický', 'Vysočina', 'Jihomoravský', 'Olomoucký', 'Zlínský', 'Moravskoslezský'];

const Device = ({ height = 760, children, label }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 8 }}>
    {label && <span className="caption" style={{ color: 'var(--ink-secondary)' }}>{label}</span>}
    <div className="k-device k-sheet-host" style={{ height }}>{children}</div>
  </div>
);
const Desk = ({ height = 800, children }) => <div className="k-desk k-sheet-host" style={{ height }}>{children}</div>;
const Scroll = ({ children }) => <div className="k-device__scroll">{children}</div>;
const Cap = ({ children }) => <p className="k-cap">{children}</p>;
const Row = ({ children, gap = 24, wrap = true }) => <div style={{ display: 'flex', gap, flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: 'flex-start' }}>{children}</div>;
const Cell = ({ label, w = 320, children }) => <div style={{ width: w, maxWidth: '100%' }}><Cap>{label}</Cap>{children}</div>;
const Wrap = ({ children }) => <div style={{ padding: 24 }}>{children}</div>;

/* =================== COMPONENT PREVIEWS =================== */
export function PButton() {
  return (
    <Wrap><Row>
      <Cell label="Primární — výchozí"><Button block>Spustit kompas</Button></Cell>
      <Cell label="Primární — hover"><Button block state="hover">Spustit kompas</Button></Cell>
      <Cell label="Primární — focus"><Button block state="focus">Spustit kompas</Button></Cell>
      <Cell label="Primární — stisk"><Button block state="active">Spustit kompas</Button></Cell>
      <Cell label="Primární — nedostupné"><Button block disabled>Podepsat</Button></Cell>
      <Cell label="Sekundární textové"><div className="k-row"><Button variant="secondary">Přeskočit otázku</Button><Button variant="secondary" state="hover">Hover</Button><Button variant="secondary" state="focus">Focus</Button><Button variant="secondary" disabled>Nedostupné</Button></div></Cell>
    </Row></Wrap>
  );
}
export function PStickyBar() {
  return (
    <Wrap><Row>
      <Cell label="Jedna akce" w={360}><div style={{ border: '2px solid var(--ink)' }}><StickyBar static><Button block iconEnd="arrow-right">Další otázka</Button></StickyBar></div></Cell>
      <Cell label="Primární + sekundární" w={360}><div style={{ border: '2px solid var(--ink)' }}><StickyBar static><Button block iconEnd="arrow-right">Další otázka</Button><Button variant="secondary">Přeskočit</Button></StickyBar></div></Cell>
    </Row></Wrap>
  );
}
export function PAnswerOption() {
  return (
    <Wrap><Row>
      <Cell label="Výchozí"><AnswerOption label="Poplatek jako dnes" /></Cell>
      <Cell label="Hover"><AnswerOption label="Poplatek jako dnes" state="hover" /></Cell>
      <Cell label="Focus (klávesnice)"><AnswerOption label="Poplatek jako dnes" state="focus" /></Cell>
      <Cell label="Vybráno"><AnswerOption label="Zvláštní poplatek přes daně" selected /></Cell>
      <Cell label="Vybráno + focus"><AnswerOption label="Zvláštní poplatek přes daně" selected state="focus" /></Cell>
      <Cell label="Nedostupné — klepnutí otevře vysvětlení"><AnswerOption label="Jen dobrovolné příspěvky" disabled conflict="stabilní rozpočet (otázka 1)" /></Cell>
      <Cell label="Chyba skupiny" w={360}><AnswerGroup legend="Odkud mají peníze jít?" error="Vyber jednu možnost, nebo „Nevím“."><AnswerOption label="Poplatek jako dnes" /><AnswerOption label="Nevím" /></AnswerGroup></Cell>
    </Row></Wrap>
  );
}
export function PDisclosure() {
  const [o, setO] = useState(true);
  return (
    <Wrap><Row>
      <Cell label="Mobil — otevírá spodní panel" w={340}><Disclosure /></Cell>
      <Cell label="Hover" w={340}><Disclosure state="hover" /></Cell>
      <Cell label="Desktop — rozbalení na místě" w={420}>
        <Disclosure mode="inline" open={o} onToggle={() => setO(!o)}>
          <p>Poplatek se platí spolu s daní, ne zvlášť.</p><p>Vláda výši nemění bez zákona.</p>
          <p><a className="k-link" href="#">Metodika kompasu<Icon name="external" size={18} /></a></p>
        </Disclosure>
      </Cell>
    </Row></Wrap>
  );
}
export function PBottomSheet() {
  return (
    <Wrap><Device height={520}>
      <div className="k-section"><h1 className="h1 k-h">Odkud mají peníze jít?</h1></div>
      <BottomSheet {...SHEET} />
    </Device></Wrap>
  );
}
export function PBudgetSlider() {
  return (
    <Wrap><Row>
      <Cell label="Přesně na kotvě „Dnes“: bublina modrá" w={316}><BudgetSlider value={9.2} anchors={ANCHORS} /></Cell>
      <Cell label="Mezi kotvami: bublina říká rozdíl" w={316}><BudgetSlider value={8.4} anchors={ANCHORS} /></Cell>
      <Cell label="Na „Návrhu vlády“" w={316}><BudgetSlider value={7.0} anchors={ANCHORS} /></Cell>
    </Row><p className="k-cap" style={{ marginTop: 16 }}>Táhni jezdcem: do 0,15 mld od kotvy se přichytí. Zářezy na dráze jsou klikací.</p><SampleBanner text="Hodnoty a kotvy jsou ukázkové." /></Wrap>
  );
}
export function PProgressBar() {
  return (
    <Wrap><Row>
      <Cell label="Otázka 1 z 8"><ProgressBar current={1} /></Cell>
      <Cell label="Otázka 3 z 8"><ProgressBar current={3} /></Cell>
      <Cell label="Otázka 8 z 8"><ProgressBar current={8} /></Cell>
    </Row></Wrap>
  );
}
export function PTextInput() {
  return (
    <Wrap><Row>
      <Cell label="Výchozí"><TextInput label="Jméno a příjmení" placeholder="Jana Nováková" /></Cell>
      <Cell label="Hover"><TextInput label="Jméno a příjmení" placeholder="Jana Nováková" state="hover" /></Cell>
      <Cell label="Focus"><TextInput label="E-mail" value="jana@" state="focus" /></Cell>
      <Cell label="Chyba"><TextInput label="E-mail" value="jana@" error="Zadej e-mail ve tvaru jmeno@domena.cz." /></Cell>
      <Cell label="Nedostupné"><TextInput label="Obec" value="Znojmo" disabled hint="Doplní se podle kraje." /></Cell>
    </Row></Wrap>
  );
}
export function PSelect() {
  return (
    <Wrap><Row>
      <Cell label="Výchozí"><Select label="Kraj" options={KRAJE} /></Cell>
      <Cell label="Vybráno"><Select label="Kraj" options={KRAJE} value="Jihomoravský" /></Cell>
      <Cell label="Focus"><Select label="Kraj" options={KRAJE} value="Jihomoravský" state="focus" /></Cell>
      <Cell label="Chyba"><Select label="Kraj" options={KRAJE} error="Vyber kraj, ať víme, komu psát." /></Cell>
      <Cell label="Nedostupné"><Select label="Kraj" options={KRAJE} disabled /></Cell>
    </Row></Wrap>
  );
}
export function PCheckbox() {
  return (
    <Wrap><Row>
      <Cell label="Výchozí"><Checkbox label="Souhlasím se zpracováním údajů kvůli podpisu." /></Cell>
      <Cell label="Zaškrtnuto"><Checkbox checked label="Souhlasím se zpracováním údajů kvůli podpisu." /></Cell>
      <Cell label="Focus"><Checkbox state="focus" label="Souhlasím se zpracováním údajů." /></Cell>
      <Cell label="Chyba"><Checkbox error="Bez souhlasu podpis neuložíme." label="Souhlasím se zpracováním údajů." /></Cell>
      <Cell label="Nedostupné"><Checkbox disabled label="Poslat kopii e-mailem" /></Cell>
    </Row></Wrap>
  );
}
export function PToggle() {
  return (
    <Wrap><Row>
      <Cell label="Vypnuto"><Toggle label="Zobrazit mé jméno" hint="Jinak budeš „Anonym z Jihomoravského kraje“." /></Cell>
      <Cell label="Zapnuto"><Toggle checked label="Zobrazit mé jméno" hint="Jméno uvidí ostatní u podpisů." /></Cell>
    </Row></Wrap>
  );
}
export function PStepSlider() {
  return (
    <Wrap><Row>
      <Cell label="Forma" w={340}><StepSlider label="Forma" steps={['Úřední', 'Věcná', 'Osobní']} value={1} /></Cell>
      <Cell label="Délka a důraznost" w={340}><StepSlider label="Délka a důraznost" steps={['Krátce', 'Středně', 'Důrazně']} value={0} /></Cell>
    </Row></Wrap>
  );
}
export function PBarChart() {
  return (
    <Wrap><SampleBanner /><div style={{ maxWidth: 480, marginTop: 16 }}><BarChart title="Odkud mají peníze jít?" data={Q2DATA} foot={`Ukázková data · 12${NB}480 odpovědí`} /></div></Wrap>
  );
}
export function PStanceBlock() {
  return (
    <Wrap><Row>
      <Cell label="Mobil" w={360}><StanceBlock text={STANCE} by={STANCE_BY} /></Cell>
      <Cell label="Hover na primárním tlačítku" w={360}><div className="k-stance"><p className="k-kicker">Kde stojíme my</p><p className="k-stance__text h1">{STANCE}</p><div className="k-stance__actions"><Button variant="inverse" block iconEnd="arrow-right" state="hover">Napsat zástupcům</Button><Button variant="inverse-outline" block iconEnd="arrow-right" state="focus">Profilová fotka</Button></div></div></Cell>
    </Row></Wrap>
  );
}
export function PSample() {
  return (
    <Wrap><div className="k-col">
      <Cap>Odznak v hlavičce — celé prostředí je ukázka</Cap><div><SampleBadge /></div>
      <Cap>Pruh nad každým blokem s ukázkovými čísly</Cap><SampleBanner />
    </div></Wrap>
  );
}
export function PFlagHero() {
  const [k, setK] = useState(0);
  return (
    <Wrap><Row gap={32}>
      <Cell label="Vlajka — vždy 3 : 2, vždy sama, animace 500 ms jednou" w={360}><div key={k}><Flag animate /></div><div style={{ marginTop: 8 }}><Button variant="secondary" icon="refresh" onClick={() => setK(k + 1)}>Přehrát znovu</Button></div></Cell>
      <Cell label="Na tmavé ploše: obrys v barvě on-night" w={260}><div className="k-night" style={{ padding: 40 }}><Flag /></div></Cell>
      <Cell label="Značka v hlavičce (vlajka 24 × 16)" w={240}><Wordmark /></Cell>
      <Cell label="Výběrová značka: celá vlajka v kruhu" w={240}><div className="k-row" style={{ alignItems: 'center' }}><SelectMark /><SelectMark on /><div style={{ background: 'var(--blue)', padding: 8, color: 'var(--on-blue)' }}><SelectMark on /></div></div></Cell>
    </Row></Wrap>
  );
}
export function PFlagUnfold() {
  const [k, setK] = useState(0);
  return (
    <Wrap><Row>
      <Cell label="Potvrzení podpisu — 800 ms, vlajka 3 : 2, text pod ní" w={360}><div key={k} style={{ position: 'relative', height: 520, border: '2px solid var(--ink)' }}><FlagUnfold /></div><div style={{ marginTop: 8 }}><Button variant="secondary" icon="refresh" onClick={() => setK(k + 1)}>Přehrát znovu</Button></div></Cell>
    </Row></Wrap>
  );
}
export function PStatementPreview() {
  return (
    <Wrap><Row>
      <Cell label="Sbaleno (mobil, nad tlačítkem)" w={360}><StatementPreview paragraphs={MYTEXT} /></Cell>
      <Cell label="Rozbaleno" w={360}><StatementPreview open paragraphs={MYTEXT} /></Cell>
    </Row></Wrap>
  );
}
export function PPhotoFrame() {
  return (
    <Wrap><Row>
      {['ring', 'ribbon', 'corner', 'duotone'].map((v) => <Cell key={v} label={{ ring: 'Trikolorní prstenec', ribbon: 'Stuha přes spodní třetinu', corner: 'Vlajka v rohu (sama, 3 : 2)', duotone: 'Duotón s velkým heslem' }[v]} w={220}><PhotoFrame variant={v} size={200} /></Cell>)}
    </Row></Wrap>
  );
}
export function PShareImage() {
  return (
    <Wrap><Row>
      <Cell label="OG 1200 × 630" w={480}><ShareImage format="og" scale={0.4} choices={['Zvláštní poplatek přes daně', '9,2 mld Kč ročně', 'Rady volí Sněmovna i Senát']} /></Cell>
      <Cell label="Čtverec 1080 × 1080" w={260}><ShareImage format="square" scale={0.24} choices={['Zvláštní poplatek přes daně', '9,2 mld Kč ročně', 'Rady volí Sněmovna i Senát']} /></Cell>
    </Row></Wrap>
  );
}
export function PIcon() {
  const names = ['arrow-right', 'chevron-right', 'chevron-down', 'chevron-left', 'plus', 'minus', 'close', 'info', 'alert', 'external', 'download', 'mail', 'share', 'compare', 'law', 'refresh'];
  return <Wrap><div className="k-row">{names.map((n) => <div key={n} style={{ width: 96, textAlign: 'center' }}><Icon name={n} size={32} /><div className="caption" style={{ color: 'var(--ink-secondary)' }}>{n}</div></div>)}</div></Wrap>;
}

/* =================== SCREENS =================== */
function HomeBody({ desktop }) {
  if (desktop) return (
    <div className="k-night" style={{ padding: '72px 48px 80px', display: 'grid', gridTemplateColumns: '1fr 400px', gap: 96, alignItems: 'center' }}>
      <div>
        <p className="k-kicker">Občanský kompas · 8 otázek</p>
        <h1 className="display-desktop k-h">Jak by se měla platit veřejnoprávní média?</h1>
        <p className="k-lede" style={{ marginTop: 24, fontSize: 20 }}>8 otázek. 5 minut. Tvůj názor na papíře.</p>
        <div style={{ width: 360, marginTop: 40 }}><Button block iconEnd="arrow-right">Spustit kompas</Button></div>
      </div>
      <div style={{ padding: 25 }}><Flag animate /></div>
    </div>
  );
  return (
    <div className="k-night" style={{ padding: '40px 16px 40px' }}>
      <div style={{ width: 200, margin: '0 0 48px 12px' }}><Flag animate /></div>
      <p className="k-kicker">8 otázek · 5 minut</p>
      <h1 className="display k-h">Jak by se měla platit veřejnoprávní média?</h1>
      <p className="k-lede" style={{ marginTop: 16 }}>Tvůj názor na papíře. Pak ho můžeš podepsat.</p>
    </div>
  );
}
function HomeRest({ desktop }) {
  return (
    <div style={desktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr' } : undefined}>
      <div style={desktop ? { padding: 48 } : undefined}><StanceBlock text={STANCE} by={STANCE_BY} /></div>
      <div style={desktop ? { padding: '48px 48px 48px 0' } : undefined}>
        <SampleBanner />
        <div className="k-section" style={desktop ? { padding: '32px 0' } : { paddingTop: 32 }}>
          <p className="k-stat" style={{ marginBottom: 32 }}><span className="stat-xl">12{NB}480</span><span className="kicker" style={{ flexBasis: '100%' }}>lidí už kompas vyplnilo</span></p>
          <BarChart title="Odkud mají peníze jít?" data={Q2DATA} />
          <p style={{ margin: '16px 0 0' }}><a className="k-link" href="#">Jak kompas vznikl a co měří<Icon name="arrow-right" size={18} /></a></p>
        </div>
      </div>
    </div>
  );
}
export function SHome() {
  return (
    <Wrap><Device height={780}>
      <AppBar night />
      <Scroll><HomeBody /><HomeRest /></Scroll>
      <StickyBar><Button block iconEnd="arrow-right">Spustit kompas</Button></StickyBar>
    </Device></Wrap>
  );
}
export function SHomeDesktop() {
  return (
    <Wrap><Desk height={1520}>
      <AppBar night />
      <HomeBody desktop /><HomeRest desktop />
    </Desk></Wrap>
  );
}
function QuizQ({ sel = 1, onExplain }) {
  return (
    <AnswerGroup legend="Odkud mají peníze jít?" lede="Vyber jednu možnost.">
      {Q2.map((q, i) => i === 5
        ? <AnswerOption key={q} label={q} disabled conflict="stabilní rozpočet (otázka 1)" onExplain={onExplain} />
        : <AnswerOption key={q} label={q} selected={i === sel} />)}
    </AnswerGroup>
  );
}
export function SQuiz() {
  return (
    <Wrap><Device height={900}>
      <AppBar back="Zpět" />
      <Scroll>
        <div className="k-section"><ProgressBar current={3} /></div>
        <div className="k-section" style={{ borderTop: 0, paddingTop: 0 }}><QuizQ /><div style={{ marginTop: 16 }}><Disclosure /></div></div>
      </Scroll>
      <div style={{ padding: '0 16px 8px' }}><StatementPreview paragraphs={MYTEXT} /></div>
      <StickyBar><Button block iconEnd="arrow-right">Další otázka</Button></StickyBar>
    </Device></Wrap>
  );
}
export function SQuizDesktop() {
  const [o, setO] = useState(false);
  return (
    <Wrap><Desk height={900}>
      <AppBar back="Zpět" />
      <div style={{ display: 'grid', gridTemplateColumns: '688px 448px', gap: 48, padding: '40px 48px', flex: 1 }}>
        <div>
          <ProgressBar current={3} />
          <div style={{ marginTop: 40 }}>
            <fieldset className="k-group"><legend className="k-group__legend"><span className="h1-desktop" style={{ display: 'block' }}>Odkud mají peníze jít?</span><span className="k-lede" style={{ display: 'block' }}>Vyber jednu možnost.</span></legend>
              {Q2.map((q, i) => i === 5 ? <AnswerOption key={q} label={q} disabled conflict="stabilní rozpočet (otázka 1)" /> : <AnswerOption key={q} label={q} selected={i === 1} />)}
            </fieldset>
          </div>
          <div style={{ marginTop: 16 }}><Disclosure mode="inline" open={o} onToggle={() => setO(!o)}><p>{SHEET.lines[0]}</p><p>{SHEET.lines[1]}</p><p>{SHEET.lines[2]}</p></Disclosure></div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 32 }}><div style={{ width: 320 }}><Button block iconEnd="arrow-right">Další otázka</Button></div><Button variant="secondary">Přeskočit</Button></div>
        </div>
        <aside style={{ borderLeft: '2px solid var(--ink)', paddingLeft: 32 }}>
          <p className="k-kicker">Můj text</p>
          <div className="k-mytext__body" style={{ padding: 0 }}>{MYTEXT.map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p }} />)}</div>
          <p className="k-cap" style={{ marginTop: 16 }}>Text se skládá z tvých odpovědí. Podepíšeš ho na konci.</p>
        </aside>
      </div>
    </Desk></Wrap>
  );
}
export function SBudget() {
  return (
    <Wrap><Device height={760}>
      <AppBar back="Zpět" />
      <Scroll>
        <div className="k-section"><ProgressBar current={4} /></div>
        <div className="k-section" style={{ borderTop: 0, paddingTop: 0 }}>
          <h1 className="h1 k-h">Kolik peněz ročně má ČT a ČRo dostat?</h1>
          <p className="k-lede">Posuň jezdec. Bublina ukáže, kde jsi.</p>
          <div style={{ marginTop: 32 }}><BudgetSlider value={9.2} anchors={ANCHORS} /></div>
          <div style={{ marginTop: 24 }}><Disclosure /></div>
        </div>
        <SampleBanner text="Kotvy jsou ukázkové." />
      </Scroll>
      <StickyBar><Button block iconEnd="arrow-right">Další otázka</Button><Button variant="secondary">Nevím</Button></StickyBar>
    </Device></Wrap>
  );
}
export function SSheet() {
  return (
    <Wrap><Device height={760}>
      <AppBar back="Zpět" />
      <Scroll>
        <div className="k-section"><ProgressBar current={3} /></div>
        <div className="k-section" style={{ borderTop: 0, paddingTop: 0 }}><QuizQ /></div>
      </Scroll>
      <StickyBar><Button block iconEnd="arrow-right">Další otázka</Button></StickyBar>
      <BottomSheet {...SHEET} />
    </Device></Wrap>
  );
}
const STATEMENT = [
  'Chci, aby Česká televize a Český rozhlas byly placeny zvláštním poplatkem vybíraným přes daně.',
  'Rozpočet obou médií má být 9,2 miliardy korun ročně a nesmí záviset na vůli vlády.',
  'O vedení médií mají rozhodovat rady volené Sněmovnou i Senátem.',
];
function SignForm() {
  return (
    <div className="k-stack-2">
      <TextInput label="Jméno a příjmení" placeholder="Jana Nováková" autoComplete="name" />
      <TextInput label="E-mail" type="email" placeholder="jana@example.cz" hint="Pošleme jen potvrzení podpisu. Žádný spam." autoComplete="email" />
      <Toggle label="Zobrazit mé jméno" hint="Jinak budeš „Anonym z Jihomoravského kraje“." />
      <Checkbox label="Souhlasím se zpracováním údajů kvůli podpisu. " ><a className="k-link" href="#" style={{ minHeight: 0 }}>Podrobnosti</a></Checkbox>
    </div>
  );
}
function Statement() {
  return (
    <div className="k-letter" style={{ fontSize: 17, lineHeight: '26px' }}>
      <p className="k-letter__meta">Prohlášení · složené z tvých 8 odpovědí</p>
      {STATEMENT.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}
export function SSign() {
  return (
    <Wrap><Device height={1100}>
      <AppBar back="Upravit" />
      <Scroll>
        <div className="k-section"><h1 className="h1 k-h">Podepiš své prohlášení</h1><p className="k-lede">Zkontroluj text a doplň jméno.</p></div>
        <div className="k-section" style={{ borderTop: 0, paddingTop: 0 }}><Statement /></div>
        <div className="k-section"><SignForm /></div>
      </Scroll>
      <StickyBar><Button block disabled>Podepsat</Button></StickyBar>
    </Device></Wrap>
  );
}
export function SSignDesktop() {
  return (
    <Wrap><Desk height={860}>
      <AppBar back="Upravit" />
      <div style={{ padding: '40px 48px 0' }}><h1 className="h1-desktop k-h">Podepiš své prohlášení</h1><p className="k-lede">Zkontroluj text a doplň jméno.</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: '688px 448px', gap: 48, padding: '32px 48px' }}>
        <Statement />
        <div><SignForm /><div style={{ marginTop: 24 }}><Button block>Podepsat</Button></div></div>
      </div>
    </Desk></Wrap>
  );
}
export function SSignDone() {
  const T = [0, 300, 600, 800];
  return (
    <Wrap><Row>
      {T.map((t) => (
        <Cell key={t} label={t + ' ms'} w={280}>
          <div style={{ position: 'relative', width: 280, height: 420, border: '2px solid var(--ink)' }}><FlagUnfold still={t} title="Podepsáno." text="Díky." /></div>
        </Cell>
      ))}
    </Row></Wrap>
  );
}
export function SResult() {
  return (
    <Wrap><Device height={1180}>
      <AppBar />
      <Scroll>
        <div className="k-section">
          <p className="k-kicker">Podepsáno 27. 10. 2026</p>
          <h1 className="h1 k-h">Moje prohlášení</h1>
          <div style={{ marginTop: 16 }}><Statement /></div>
          <p className="k-cap" style={{ marginTop: 8 }}>Jana Nováková · Jihomoravský kraj</p>
        </div>
        <div className="k-section">
          <ul className="k-actionlist">
            <li><button><span style={{ display: 'flex', gap: 16, alignItems: 'center' }}><Icon name="compare" />Porovnat se s ostatními</span><Icon name="chevron-right" /></button></li>
            <li><button><span style={{ display: 'flex', gap: 16, alignItems: 'center' }}><Icon name="law" />Můj zákon</span><Icon name="chevron-right" /></button></li>
          </ul>
        </div>
        <StanceBlock text={STANCE} by={STANCE_BY} />
      </Scroll>
      <StickyBar><Button block icon="share">Sdílet</Button></StickyBar>
    </Device></Wrap>
  );
}
export function SStats() {
  return (
    <Wrap><Device height={1500}>
      <AppBar back="Zpět" />
      <Scroll>
        <div className="k-section">
          <h1 className="h1 k-h">Jak odpovídají ostatní</h1>
          <p className="k-lede">Vzorek lidí, kteří kompas vyplnili. Není to reprezentativní průzkum.</p>
        </div>
        <SampleBanner />
        <div className="k-section" style={{ borderTop: 0 }}>
          <div className="k-stack-2">
            <Select label="Kraj" options={['Celá ČR'].concat(KRAJE)} value="Celá ČR" />
            <StepSlider label="Věk" steps={['Vše', '18–39', '40+']} value={0} />
          </div>
          <p className="k-stat" style={{ margin: '24px 0 0' }}><span className="stat-xl k-num" style={{ color: 'var(--red)' }}>12{NB}480</span><span className="body-strong">vyplněných kompasů</span></p>
        </div>
        <div className="k-section"><BarChart title="Odkud mají peníze jít?" data={Q2DATA} /></div>
        <div className="k-section"><BarChart title="Kolik peněz ročně?" data={[{ label: 'Méně než dnes', value: 24 }, { label: 'Jako dnes', value: 41 }, { label: 'Více než dnes', value: 27 }, { label: 'Nevím', value: 8 }]} /></div>
        <div className="k-section"><BarChart title="Kdo má volit rady?" data={[{ label: 'Sněmovna', value: 21 }, { label: 'Sněmovna i Senát', value: 46 }, { label: 'Odborné organizace', value: 23 }, { label: 'Nevím', value: 10 }]} foot={`Ukázková data · n = 12${NB}480`} /></div>
      </Scroll>
    </Device></Wrap>
  );
}
const RECIPIENTS = ['Poslanci za můj kraj', 'Můj senátor', 'Zastupitelstvo kraje', 'Zastupitelstvo obce', 'Ministr kultury', 'Prezident'];
export function SLetter() {
  return (
    <Wrap><Device height={1520}>
      <AppBar back="Zpět" />
      <Scroll>
        <div className="k-section"><h1 className="h1 k-h">Napiš zástupcům</h1><p className="k-lede">Dopis vychází z tvého prohlášení.</p></div>
        <div className="k-section" style={{ borderTop: 0, paddingTop: 0 }}>
          <fieldset className="k-group"><legend className="k-field__label" style={{ marginBottom: 4 }}>Komu</legend>
            {RECIPIENTS.map((r, i) => <Checkbox key={r} checked={i < 2} label={r} />)}
          </fieldset>
        </div>
        <div className="k-section">
          <div className="k-stack-3">
            <StepSlider label="Forma" steps={['Úřední', 'Věcná', 'Osobní']} value={1} />
            <StepSlider label="Délka a důraznost" steps={['Krátce', 'Středně', 'Důrazně']} value={0} />
          </div>
        </div>
        <div className="k-section">
          <div className="k-letter__head"><span className="k-field__label">Náhled dopisu</span><Button variant="secondary" icon="refresh">Jiná varianta</Button></div>
          <div className="k-letter">
            <p className="k-letter__meta">Komu: 3 poslanci za Jihomoravský kraj, senátor za obvod 54</p>
            <p>Vážená paní poslankyně, vážený pane poslanče,</p>
            <p>píšu vám jako občanka z Jihomoravského kraje. Chci, aby Česká televize a Český rozhlas měly stabilní peníze, na které vláda nemůže sáhnout.</p>
            <p>Prosím, hlasujte proti změnám, které by financování médií svázaly se státním rozpočtem.</p>
            <p>S pozdravem<br />Jana Nováková</p>
          </div>
        </div>
      </Scroll>
      <StickyBar><Button block icon="download">Stáhnout PDF</Button><Button variant="secondary" icon="mail">Otevřít e-mail</Button></StickyBar>
    </Device></Wrap>
  );
}
const SLOGANS = ['Ruce pryč od médií', 'Média nedáme', 'Média veřejné služby mi nejsou jedno'];
export function SPhoto() {
  const [v, setV] = useState('ring');
  const [s, setS] = useState(0);
  const V = [['ring', 'Prstenec'], ['ribbon', 'Stuha'], ['corner', 'Roh'], ['duotone', 'Duotón']];
  return (
    <Wrap><Device height={1040}>
      <AppBar back="Zpět" />
      <Scroll>
        <div className="k-section"><h1 className="h1 k-h">Profilová fotka</h1><p className="k-lede">Fotka zůstává v tvém telefonu.</p></div>
        <div style={{ display: 'grid', placeItems: 'center', padding: '0 16px 24px' }}><PhotoFrame variant={v} slogan={SLOGANS[s]} size={296} /></div>
        <div className="k-section">
          <p className="k-field__label" style={{ margin: '0 0 8px' }}>Rámeček</p>
          <div className="k-swatches" role="radiogroup">{V.map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={v === id} className="k-swatch" onClick={() => setV(id)}><PhotoFrame variant={id} slogan={SLOGANS[s]} size={48} label="" />{l}</button>)}</div>
        </div>
        <div className="k-section">
          <p className="k-field__label" style={{ margin: '0 0 8px' }}>Heslo</p>
          <div role="radiogroup">{SLOGANS.map((l, i) => <AnswerOption key={l} label={l} selected={s === i} onSelect={() => setS(i)} />)}</div>
        </div>
        <div className="k-section"><Button variant="secondary" icon="refresh">Vybrat jinou fotku</Button></div>
      </Scroll>
      <StickyBar><Button block icon="download">Stáhnout fotku</Button></StickyBar>
    </Device></Wrap>
  );
}
export function SShare() {
  const ch = ['Zvláštní poplatek přes daně', '9,2 mld Kč ročně', 'Rady volí Sněmovna i Senát'];
  return (
    <Wrap><Row gap={32}>
      <Cell label="OG 1200 × 630 (odkaz)" w={600}><ShareImage format="og" scale={0.5} choices={ch} /></Cell>
      <Cell label="Čtverec 1080 × 1080" w={378}><ShareImage format="square" scale={0.35} choices={ch} /></Cell>
      <Cell label="Story 1080 × 1920" w={324}><ShareImage format="story" scale={0.3} choices={ch} /></Cell>
    </Row></Wrap>
  );
}

/* =================== DO / DON'T =================== */
const DD = ({ ok, title, children }) => (
  <div style={{ border: '2px solid var(--ink)', width: 312 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '2px solid var(--ink)', background: ok ? 'var(--blue)' : 'var(--surface)', color: ok ? 'var(--on-blue)' : 'var(--ink)', fontWeight: 700 }}>
      <span className="kicker" style={{ fontFamily: 'var(--font-wide)', fontSize: 12, letterSpacing: '.08em' }}>{ok ? 'Ano' : 'Ne'}</span><span style={{ fontWeight: 600 }}>{title}</span>
    </div>
    <div style={{ padding: 16, minHeight: 128, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>{children}</div>
  </div>
);
export function PDoDont() {
  return (
    <Wrap><Row gap={16}>
      <DD ok title="vlajka 3 : 2, sama"><div style={{ width: 150, margin: '0 auto' }}><Flag /></div></DD>
      <DD title="text přes vlajku"><div style={{ position: 'relative', width: 150, margin: '0 auto' }}><Flag label="" /><span style={{ position: 'absolute', left: 40, top: 40, color: '#fff', fontWeight: 800, fontFamily: 'var(--font-wide)' }}>Podepsáno</span></div></DD>
      <DD title="natažená vlajka"><svg viewBox="0 0 900 600" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 60, outline: '1px solid var(--ink)' }}><rect width="900" height="300" fill="#fff" /><rect y="300" width="900" height="300" fill="#D7141A" /><path d="M0 0L450 300 0 600z" fill="#11457E" /></svg></DD>
      <DD ok title="výběr = vlajka v kruhu"><AnswerOption label="Nevím" selected /></DD>
      <DD title="fajfka"><div className="k-opt" style={{ background: 'var(--blue)', borderColor: 'var(--blue)', color: 'var(--on-blue)' }}><span style={{ fontSize: 22, fontWeight: 800 }}>✓</span>Nevím</div></DD>
      <DD ok title="ostré hrany"><Button block iconEnd="arrow-right">Spustit kompas</Button></DD>
      <DD title="zaoblení a stín"><button style={{ height: 56, borderRadius: 999, border: 0, background: 'var(--blue)', color: 'var(--on-blue)', fontWeight: 600, fontSize: 17, boxShadow: '0 8px 20px rgba(17,69,126,.35)' }}>Spustit kompas</button></DD>
      <DD title="červená na odpovědi"><div className="k-opt" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}>Nevím</div></DD>
      <DD ok title="chyba = ink + ikona + linka"><p className="k-error" style={{ margin: 0 }}><Icon name="alert" />Vyber jednu možnost.</p></DD>
      <DD title="chyba červeně"><p style={{ margin: 0, color: 'var(--red)', fontWeight: 600 }}>Vyber jednu možnost.</p></DD>
      <DD ok title="posuvník: bublina nad jezdcem"><BudgetSlider value={9.2} anchors={ANCHORS} /></DD>
      <DD title="statické popisky pod drahou"><div style={{ borderTop: '4px solid var(--ink)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>| Návrh vlády</span><span>| Dnes</span><span>| +10 %</span></div></DD>
      <DD ok title="jedna věta + Co to znamená?"><h3 className="h3 k-h">Odkud mají peníze jít?</h3><p className="small" style={{ margin: 0 }}>Vyber jednu možnost.</p><Disclosure /></DD>
      <DD title="zeď textu"><p className="small" style={{ margin: 0 }}>Veřejnoprávní média jsou dnes financována z poplatků, které platí domácnosti a firmy podle zákona. Existuje řada modelů, jak to změnit, a každý má své výhody i nevýhody…</p></DD>
      <DD ok title="ukázková data označená"><SampleBanner /></DD>
      <DD title="vymyšlené svědectví"><p style={{ margin: 0, fontStyle: 'italic' }}>„Kompas mi změnil pohled!“ — Petr, 34</p></DD>
    </Row></Wrap>
  );
}
