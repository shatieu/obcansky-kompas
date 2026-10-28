import { facts, questionsFile, sentencesFile, ui } from "@/lib/content";
import type { ContentBundle } from "./core";

/** Aktuální obsah pro skládání textu. Kompas importuje jen tohle (bez zmrazených starých verzí). */
export const currentBundle: ContentBundle = {
  questions: questionsFile,
  sentences: sentencesFile,
  facts,
  units: { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole },
};
