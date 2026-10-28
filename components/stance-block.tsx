import { stance, ui } from "@/lib/content";

/**
 * Blok „Kde stojíme my“ (SPEC §9.1): inverzní modrá plocha, jasně oddělená od kompasu.
 * Postoj se nikdy nepropisuje do kompasu, vysvětlivek ani statistik.
 */
export function StanceBlock() {
  return (
    <section aria-label={ui.stance.region_aria} className="bg-blue text-on-blue">
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <h2 className="text-3xl font-bold leading-tight md:text-4xl">{stance.title}</h2>
        <p className="mt-3 max-w-2xl text-xl">{stance.text}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {stance.actions.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="inline-flex min-h-14 items-center justify-center border-2 border-on-blue px-6 text-lg font-semibold text-on-blue no-underline transition-colors transition-fast hover:bg-on-blue hover:text-blue"
            >
              {a.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
