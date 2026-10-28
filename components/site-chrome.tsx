import { ui } from "@/lib/content";

export function SiteHeader() {
  return (
    <header className="border-b-2 border-ink">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4">
        {/* Obyčejné odkazy místo next/link: ušetří chunk routeru na /kompas (SPEC §4.6, 150 kB). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" aria-label={ui.site.home_aria} className="flex min-h-14 items-center font-bold text-ink no-underline">
          <span>{ui.site.name}</span>
        </a>
        <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-4 sm:text-base">
          <a href="/kompas" className="inline-flex min-h-12 items-center px-2 text-ink no-underline hover:underline">
            {ui.nav.compass}
          </a>
          <a href="/statistiky" className="inline-flex min-h-12 items-center px-2 text-ink no-underline hover:underline">
            {ui.nav.stats}
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const links = [
    { href: "/metodika", label: ui.footer.method },
    { href: "/o-projektu", label: ui.footer.about },
    { href: "/soukromi", label: ui.footer.privacy },
  ];
  return (
    <footer className="border-t-2 border-ink">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="font-semibold">{ui.footer.lead}</p>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="inline-flex min-h-12 items-center">
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href={ui.footer.source_url} className="inline-flex min-h-12 items-center" rel="noopener noreferrer">
              {ui.footer.source}
            </a>
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted">{ui.footer.license}</p>
      </div>
    </footer>
  );
}
