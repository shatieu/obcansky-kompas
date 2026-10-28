import type { ReactNode } from "react";
import type { Statement, StatementBlock } from "@/lib/compose/core";

/**
 * Text k podpisu rozdělený na odstavce: úvod, jeden odstavec za každou zodpovězenou otázku
 * se štítkem tématu (kicker v ink-secondary, ne červeně) a závěr. Mezi bloky 1px linka.
 * Bez hooků – funguje v serverových i klientských komponentách.
 * `label` (jen přehled odpovědí v kompasu): vlastní vykreslení štítku, např. odkaz na řádek odpovědi.
 */
export function StatementText({
  statement,
  label,
  className,
}: {
  statement: Pick<Statement, "intro" | "blocks" | "outro">;
  label?: (block: StatementBlock) => ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `k-stmt ${className}` : "k-stmt"}>
      <p className="k-stmt__end">{statement.intro.text}</p>
      {statement.blocks.map((b) => (
        <div key={b.questionId} className="k-stmt__block" data-q={b.questionId}>
          {label ? label(b) : <p className="k-stmt__label">{b.label}</p>}
          <p>{b.text}</p>
        </div>
      ))}
      <p className="k-stmt__end">{statement.outro.text}</p>
    </div>
  );
}
