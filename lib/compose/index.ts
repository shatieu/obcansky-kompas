import { sentencesFile as currentSentences } from "@/lib/content";
import { composeWith, type ComposeOptions, type Statement } from "./core";
import { getBundle } from "./registry";
import type { Answers } from "./types";

export * from "./types";
export * from "./core";
export { evaluate, isAnswered, isNevim, nevimId } from "./engine";
export { QUESTION_ORDER, questionNumber, questionOrder } from "./order";
export { registerContent, registeredVersions } from "./registry";
export { currentBundle } from "./current";

export function currentContentVersion(): string {
  return currentSentences.version;
}

/** Veřejné API dle SPEC §6. Starší `contentVersion` se skládá ze zmrazené verze (./registry). */
export function composeStatement(answers: Answers, contentVersion: string, options: ComposeOptions = {}): Statement {
  return composeWith(getBundle(contentVersion), answers, options);
}
