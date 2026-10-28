import type { QuestionsFile, SentencesFile } from "@/lib/content/schemas";

/**
 * Knihovna vět a pravidla větvení v čitelné podobě pro /metodika (SPEC §5.2, §6, §13).
 * Čisté funkce nad sentences.yaml a questions.yaml.
 */

export interface LibrarySentence {
  id: string;
  version: number;
  /** Celá věta (šablona se zástupnými symboly), nebo null u části věty. */
  text: string | null;
  /** Část věty, která se vkládá do šablony (Q7). */
  fragment: string | null;
  /** Popisek volby, ke které věta patří (u odpovědí). */
  optionLabel: string | null;
}

export interface LibraryGroup {
  key: "frame" | "nevim" | "q1" | "multi" | "options";
  /** U skupiny odpovědí id otázky (q2…q8), jinak null. */
  questionId: string | null;
  sentences: LibrarySentence[];
}

export function sentenceLibrary(sentences: SentencesFile, questions: QuestionsFile): LibraryGroup[] {
  const s = (id: string, version: number, text: string | null, fragment: string | null = null, optionLabel: string | null = null): LibrarySentence => ({
    id,
    version,
    text,
    fragment,
    optionLabel,
  });
  const optionLabel = new Map(questions.questions.flatMap((q) => q.options.map((o) => [o.id, o.label] as const)));
  const groups: LibraryGroup[] = [
    {
      key: "frame",
      questionId: null,
      sentences: [s(sentences.intro.id, sentences.intro.version, sentences.intro.text), s(sentences.outro.id, sentences.outro.version, sentences.outro.text)],
    },
    { key: "nevim", questionId: null, sentences: [s(sentences.nevim.id, sentences.nevim.version, sentences.nevim.text)] },
    {
      key: "q1",
      questionId: "q1",
      sentences: sentences.q1.map((b) => s(b.id, b.version, b.text, null, questions.q1_bands.find((x) => x.id === b.band)?.label ?? b.band)),
    },
    {
      key: "multi",
      questionId: null,
      sentences: Object.values(sentences.multi).map((m) => s(m.id, m.version, m.text)),
    },
  ];
  for (const q of questions.questions) {
    const list = Object.entries(sentences.options)
      .filter(([id]) => id.startsWith(`${q.id}-`))
      .map(([id, o]) => s(id, o.version, o.text ?? null, o.fragment ?? null, optionLabel.get(id) ?? null));
    if (list.length) groups.push({ key: "options", questionId: q.id, sentences: list });
  }
  return groups;
}

export interface BranchingRule {
  id: string;
  question: string;
  option: string;
  effects: { kind: "skip" | "only" | "disable"; question: string; options: string[] }[];
}

/** Pravidla větvení s lidskými popisky otázek a voleb. */
export function branchingRules(questions: QuestionsFile): BranchingRule[] {
  const qText = (id: string) => questions.questions.find((q) => q.id === id)?.text ?? id;
  const oLabel = (id: string) =>
    questions.questions.flatMap((q) => q.options).find((o) => o.id === id)?.label ?? id;
  return questions.rules.map((r) => ({
    id: r.id,
    question: qText(r.when.question),
    option: oLabel(r.when.option),
    effects: Object.entries(r.effects).map(([qid, e]) => {
      if ("skip" in e) return { kind: "skip" as const, question: qText(qid), options: [] };
      if ("only" in e) return { kind: "only" as const, question: qText(qid), options: e.only.map(oLabel) };
      return { kind: "disable" as const, question: qText(qid), options: e.disable.map(oLabel) };
    }),
  }));
}
