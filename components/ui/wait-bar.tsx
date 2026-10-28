/** Tenký pruh v trikolóře při čekání nad 300 ms (objeví se až po 300 ms, bez smyčky). */
export function WaitBar({ label }: { label: string }) {
  return (
    <div className="k-waitbar" role="progressbar" aria-label={label}>
      <span style={{ background: "var(--flag-white)", outline: "1px solid var(--rule-soft)" }} />
      <span style={{ background: "var(--flag-red)" }} />
      <span style={{ background: "var(--flag-blue)" }} />
    </div>
  );
}
