import type { FactValue as Fact, QuestionsFile } from "@/lib/content/schemas";
import { evaluate } from "@/lib/compose/engine";
import { q1Anchors, round1 } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type QuestionId } from "@/lib/compose/types";

/**
 * Deterministická ukázková data (SPEC §15 milník 4). Pevný seed → stejný výstup.
 * Jména jsou náhodné kombinace běžných křestních jmen a příjmení (fiktivní osoby),
 * e-maily na doméně example.invalid. Nic z toho se nevydává za skutečná data.
 */

export const SEED = 20261028;
export const SEED_COUNT = 500;
/** Pevné „dnes“ pro seed, aby výstup nezávisel na čase spuštění. */
export const SEED_EPOCH = Date.UTC(2026, 9, 1);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function weighted<T>(rng: Rng, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function uuidFrom(rng: Rng): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const FIRST_M = ["Jan", "Petr", "Tomáš", "Martin", "Jakub", "Lukáš", "Ondřej", "Pavel", "Jiří", "Michal", "Vojtěch", "Karel"];
const FIRST_F = ["Jana", "Eva", "Lucie", "Tereza", "Kateřina", "Petra", "Lenka", "Hana", "Veronika", "Anna", "Marie", "Klára"];
const LAST_M = ["Novák", "Svoboda", "Dvořák", "Černý", "Procházka", "Kučera", "Veselý", "Horák", "Němec", "Pokorný", "Marek", "Pospíšil"];
const LAST_F = ["Nováková", "Svobodová", "Dvořáková", "Černá", "Procházková", "Kučerová", "Veselá", "Horáková", "Němcová", "Pokorná", "Marková", "Pospíšilová"];

export interface SeedSignature {
  id: string;
  answers: Answers;
  region: string | null;
  ageGroup: string | null;
  municipalitySize: string | null;
  comment: string | null;
  verified: boolean;
  createdAt: string;
  verifiedAt: string | null;
  signer: { name: string; email: string; showName: boolean };
}

export interface SeedOrganization {
  name: string;
  type: "strana" | "hnuti" | "iniciativa";
  answers: Answers | null;
  justifications: Record<string, string> | null;
  submitted: boolean;
}

/** Váhy voleb Q2 (pořadí jako ve SPEC §5.1 vč. Nevím) – záměrně nerovnoměrné. */
const Q2_WEIGHTS = [26, 14, 17, 9, 6, 5, 6];

function pickSingle(rng: Rng, file: QuestionsFile, qid: QuestionId, answers: Answers): string | undefined {
  const q = file.questions.find((x) => x.id === qid)!;
  const st = evaluate(answers, file).states[qid];
  if (st.status === "skipped") return undefined;
  if (st.forced) return st.forced;
  if (rng() < 0.04) return undefined; // přeskočeno
  const allowed = q.options.filter((o) => !st.disabled[o.id]);
  const weights = allowed.map((o, i) => (o.nevim ? 1.5 : 3 + ((i * 7 + qid.charCodeAt(1)) % 5) * 2));
  return weighted(rng, allowed, weights).id;
}

function pickMulti(rng: Rng, file: QuestionsFile, answers: Answers): string[] | undefined {
  const q = file.questions.find((x) => x.id === "q7")!;
  const st = evaluate(answers, file).states.q7;
  if (st.status === "skipped" || rng() < 0.04) return undefined;
  const r = rng();
  const exclusive = q.options.filter((o) => o.exclusive);
  if (r < 0.22) return [exclusive.find((o) => !o.nevim)!.id];
  if (r < 0.3) return [exclusive.find((o) => o.nevim)!.id];
  const regular = q.options.filter((o) => !o.exclusive);
  const chosen = regular.filter((_, i) => rng() < [0.55, 0.35, 0.6, 0.5][i % 4]!);
  return (chosen.length ? chosen : [regular[Math.floor(rng() * regular.length)]!]).map((o) => o.id);
}

export function generateAnswers(rng: Rng, file: QuestionsFile, facts: Fact[]): Answers {
  const answers: Answers = {};
  const anchors = q1Anchors(file, facts).map((a) => a.value);
  const s = file.questions[0]!.slider!;
  const r = rng();
  if (r < 0.08) answers.q1 = "q1-nevim";
  else if (r < 0.12) {
    /* bez odpovědi */
  } else {
    const centre = anchors.length && rng() < 0.7 ? anchors[Math.floor(rng() * anchors.length)]! : s.min + rng() * (s.max - s.min);
    const jitter = (rng() + rng() + rng() - 1.5) * 1.2;
    answers.q1 = round1(Math.min(s.max, Math.max(s.min, centre + jitter)));
  }
  const q2 = file.questions.find((q) => q.id === "q2")!;
  if (rng() > 0.03) answers.q2 = weighted(rng, q2.options.map((o) => o.id), Q2_WEIGHTS);
  for (const qid of QUESTION_IDS.slice(2)) {
    const v = qid === "q7" ? pickMulti(rng, file, answers) : pickSingle(rng, file, qid, answers);
    if (v !== undefined) answers[qid] = v;
  }
  // Ukládají se efektivní odpovědi (vč. předvyplněných), stejně jako při skutečném podpisu.
  return evaluate(answers, file).effective;
}

export function generateSeed(file: QuestionsFile, facts: Fact[], count = SEED_COUNT, seed = SEED) {
  const rng = mulberry32(seed);
  const d = file.demographics;
  const regionWeights = d.regions.map((_, i) => 2 + ((i * 5) % 9));
  const signatures: SeedSignature[] = [];
  for (let i = 0; i < count; i++) {
    const female = rng() < 0.5;
    const first = (female ? FIRST_F : FIRST_M)[Math.floor(rng() * 12)]!;
    const last = (female ? LAST_F : LAST_M)[Math.floor(rng() * 12)]!;
    const created = SEED_EPOCH + Math.floor(rng() * 21 * 24 * 3600 * 1000);
    const verified = rng() < 0.88;
    signatures.push({
      id: uuidFrom(rng),
      answers: generateAnswers(rng, file, facts),
      region: rng() < 0.9 ? weighted(rng, d.regions, regionWeights).id : null,
      ageGroup: rng() < 0.9 ? weighted(rng, d.age_groups, [3, 4, 4, 3]).id : null,
      municipalitySize: rng() < 0.85 ? weighted(rng, d.municipality_sizes, [2, 4, 3, 4]).id : null,
      comment: rng() < 0.12 ? `Ukázkový komentář č. ${i + 1}.` : null,
      verified,
      createdAt: new Date(created).toISOString(),
      verifiedAt: verified ? new Date(created + Math.floor(rng() * 3600 * 1000)).toISOString() : null,
      signer: {
        name: `${first} ${last}`,
        email: `ukazka.${String(i + 1).padStart(3, "0")}@example.invalid`,
        showName: rng() < 0.3,
      },
    });
  }

  const orgAnswers = () => generateAnswers(rng, file, facts);
  const justify = (a: Answers) => Object.fromEntries(Object.keys(a).map((k) => [k, "Ukázkové odůvodnění fiktivního subjektu."]));
  const a1 = orgAnswers();
  const a2 = orgAnswers();
  const organizations: SeedOrganization[] = [
    { name: "Strana A", type: "strana", answers: a1, justifications: justify(a1), submitted: true },
    { name: "Hnutí B", type: "hnuti", answers: a2, justifications: justify(a2), submitted: true },
    { name: "Iniciativa C", type: "iniciativa", answers: null, justifications: null, submitted: false },
  ];
  return { signatures, organizations };
}
