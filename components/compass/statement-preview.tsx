"use client";

import { ui } from "@/lib/content";
import type { Statement } from "@/lib/compose";
import { Checkbox } from "@/components/ui/fields";
import { StatementPreview as MyText } from "@/components/ui/statement-preview";
import { Kicker } from "@/components/ui/typography";

interface Props {
  statement: Statement;
  hideUnknown: boolean;
  onToggleHide: (v: boolean) => void;
}

function HideNevim({ hideUnknown, onToggleHide }: Omit<Props, "statement">) {
  return <Checkbox label={ui.preview.hide_nevim} checked={hideUnknown} onChange={onToggleHide} />;
}

/** Živý náhled „Můj text“ (SPEC §6) – mobil: sbalený řádek nad tlačítkem. */
export function StatementPreview({ statement, hideUnknown, onToggleHide }: Props) {
  const hasAnswers = statement.parts.some((p) => p.questionId !== null);
  return (
    <MyText label={ui.preview.title} paragraphs={hasAnswers ? [statement.text] : []} peek={hasAnswers ? statement.text : ui.preview.empty}>
      {!hasAnswers && <p className="text-ink-secondary">{ui.preview.empty}</p>}
      <HideNevim hideUnknown={hideUnknown} onToggleHide={onToggleHide} />
    </MyText>
  );
}

/** Desktop: vedlejší sloupec s kickerem „Můj text“. */
export function StatementAside({ statement, hideUnknown, onToggleHide }: Props) {
  const hasAnswers = statement.parts.some((p) => p.questionId !== null);
  return (
    <section aria-labelledby="h-mytext">
      <Kicker as="div">
        <h2 id="h-mytext">{ui.preview.title}</h2>
      </Kicker>
      <div className="mt-2">{hasAnswers ? <p>{statement.text}</p> : <p className="text-ink-secondary">{ui.preview.empty}</p>}</div>
      <p className="k-cap mt-2">{ui.preview.aside_note}</p>
      <div className="mt-1">
        <HideNevim hideUnknown={hideUnknown} onToggleHide={onToggleHide} />
      </div>
    </section>
  );
}
