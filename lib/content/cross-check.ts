import type { LoadedContent } from "./load";

/** Kontroly napříč soubory (věta pro každou volbu, kotvy odkazují na existující fakta…). */
export function crossCheck(c: LoadedContent): string[] {
  const errors: string[] = [];
  const factIds = new Set(c.facts.map((f) => f.id));
  for (const req of ["gov-proposal-total-bn", "today-total-bn", "adults-count"])
    if (!factIds.has(req)) errors.push(`facts.yaml: chybí fakt ${req}`);

  for (const q of c.questions.questions) {
    for (const a of q.anchors ?? []) if (!factIds.has(a.fact)) errors.push(`${q.id}: kotva ${a.id} odkazuje na neznámý fakt ${a.fact}`);
    if (q.type === "multi" && !c.sentences.multi[q.id]) errors.push(`sentences.yaml: chybí multi.${q.id}`);
    if (q.type === "slider") continue;
    for (const o of q.options) {
      if (o.nevim) continue;
      const s = c.sentences.options[o.id];
      if (!s) {
        errors.push(`sentences.yaml: chybí věta pro ${o.id}`);
        continue;
      }
      if (q.type === "multi" && !o.exclusive && !s.fragment) errors.push(`sentences.yaml: ${o.id} potřebuje fragment`);
      if ((q.type !== "multi" || o.exclusive) && !s.text) errors.push(`sentences.yaml: ${o.id} potřebuje text`);
    }
  }
  const bandIds = c.questions.q1_bands.map((b) => b.id);
  for (const s of c.sentences.q1) if (!bandIds.includes(s.band)) errors.push(`sentences.yaml: neznámé pásmo ${s.band}`);
  for (const b of bandIds) if (!c.sentences.q1.some((s) => s.band === b)) errors.push(`sentences.yaml: chybí věta pro pásmo ${b}`);

  const optionIds = new Set(c.questions.questions.flatMap((q) => q.options.map((o) => o.id)));
  for (const { explainer } of c.explainers)
    if (explainer.id.includes("-opt") && !optionIds.has(explainer.id))
      errors.push(`explainers/${explainer.id}.yaml: neodpovídá žádné volbě v questions.yaml`);
  return errors;
}
