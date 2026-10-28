import { evaluate, isAnswered } from "@/lib/compose/engine";
import type { Answers, QuestionId } from "@/lib/compose/types";
import type { QuestionsFile } from "@/lib/content/schemas";
import type { Pose, SignColor } from "@/lib/demo/constants";
import type { AddresseeType } from "@/lib/letters/schema";
import { recipientLines, shareSentence, type Moment, type RecipientCounts } from "./moments";

/**
 * Obsah sdílecího obrázku (SPEC §9.4) – jeden popis pro OG (server, next/og) i pro Story
 * a čtverec (klient, canvas). Čisté funkce. Jméno jen se souhlasem (volající předá null jinak).
 * Míra shody se nikdy nepočítá ani neukazuje vůči stranám.
 */
export interface ShareCardItem {
  /** Malý popisek nad volbou (krátký název otázky). */
  caption: string | null;
  label: string;
}

export interface ShareCard {
  moment: Moment;
  brand: string;
  kicker: string | null;
  headline: string;
  /** Velké číslo (míra shody). */
  big: string | null;
  /** Doplňující věta pod nadpisem. */
  line: string | null;
  items: ShareCardItem[];
  /** Čísla 1–3 u voleb (podpis); u dopisů bez čísel. */
  numbered: boolean;
  /** Jméno podepsaného jen se souhlasem (show_name), jinak null. */
  name: string | null;
  /** Online demonstrace: panáček v popředí a výřez davu za ním (lib/share/demonstrace.ts). */
  figure?: ShareFigure | null;
}

/** Panáček na sdílecím obrázku. `signText` = jen schválený text (nebo předvolba). */
export interface ShareFigure {
  seed: number;
  pose: Pose;
  signColor: SignColor;
  signText: string;
  /** Sousedé v davu (seed, póza, barva) pro výřez za panáčkem; prázdné = dopočítá se ze seedu. */
  crowd: CrowdFigure[];
}

export interface CrowdFigure {
  seed: number;
  pose: Pose;
  signColor: SignColor;
}

export interface CardImageTexts {
  brand: string;
  choices_kicker: string;
  law_title: string;
  law_kicker: string;
  letters_kicker: string;
  letters_none: string;
  match_kicker: string;
  photo_kicker: string;
  photo_line: string;
}

const NBSP_PERCENT = (s: string) => s.replace(/(\d) %/g, "$1 %");

/** 3 klíčové volby = Q2 + Q3 + Q4 (stejné jako „Top 10 kombinací“ ve statistikách). */
export const KEY_QUESTIONS: QuestionId[] = ["q2", "q3", "q4"];

/** Efektivní odpovědi (vč. předvyplněných) jako popisky; vynechá odpadlé a nezodpovězené. */
export function choiceItems(answers: Answers, file: QuestionsFile, qids: QuestionId[], opts: { skipNevim?: boolean } = {}): ShareCardItem[] {
  const ev = evaluate(answers, file);
  return qids.flatMap((qid) => {
    if (ev.states[qid].status === "skipped") return [];
    const v = ev.effective[qid];
    if (!isAnswered(v) || typeof v !== "string") return [];
    const q = file.questions.find((x) => x.id === qid)!;
    const opt = q.options.find((o) => o.id === v);
    if (!opt || (opts.skipNevim && opt.nevim)) return [];
    return [{ caption: q.short, label: opt.label }];
  });
}

const base = (moment: Moment, img: CardImageTexts): Omit<ShareCard, "headline" | "kicker"> => ({
  moment,
  brand: img.brand,
  big: null,
  line: null,
  items: [],
  numbered: false,
  name: null,
});

export function podpisCard(answers: Answers, file: QuestionsFile, img: CardImageTexts, name: string | null): ShareCard {
  const items = choiceItems(answers, file, KEY_QUESTIONS);
  return {
    ...base("podpis", img),
    kicker: items.length ? img.choices_kicker : null,
    headline: shareSentence("podpis"),
    items,
    numbered: true,
    name,
  };
}

/** „Můj zákon“ + hlavní volba: první zodpovězená z Q2 → Q3 → Q4 (bez „Nevím“). */
export function zakonCard(answers: Answers, file: QuestionsFile, img: CardImageTexts, name: string | null): ShareCard {
  const main = choiceItems(answers, file, KEY_QUESTIONS, { skipNevim: true }).slice(0, 1);
  return {
    ...base("zakon", img),
    kicker: main.length ? img.law_kicker : null,
    headline: img.law_title,
    line: shareSentence("zakon"),
    items: main,
    name,
  };
}

export function dopisyCard(counts: RecipientCounts, img: CardImageTexts, forms: Record<AddresseeType, readonly [string, string, string]>): ShareCard {
  const lines = recipientLines(counts, forms);
  return {
    ...base("dopisy", img),
    kicker: img.letters_kicker,
    headline: shareSentence("dopisy"),
    items: lines.length ? lines.map((label) => ({ caption: null, label })) : [{ caption: null, label: img.letters_none }],
  };
}

/** Bez osobní fotky (server ji nikdy nedostane); klient může fotku dokreslit sám. */
export function fotkaCard(img: CardImageTexts): ShareCard {
  return { ...base("fotka", img), kicker: img.photo_kicker, headline: shareSentence("fotka"), line: img.photo_line };
}

/** Shoda s lidmi, kteří kompas vyplnili – nikdy se stranami. */
export function srovnaniCard(percent: number | null, img: CardImageTexts): ShareCard {
  if (percent === null) return { ...base("srovnani", img), kicker: null, headline: shareSentence("podpis") };
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return {
    ...base("srovnani", img),
    kicker: img.match_kicker,
    big: `${p} %`,
    headline: NBSP_PERCENT(shareSentence("srovnani", { percent: p })),
  };
}

/** Text ke sdílení (Web Share / sítě): věta momentu. */
export function cardShareText(card: ShareCard): string {
  return card.moment === "zakon" && card.line ? card.line : card.headline;
}
