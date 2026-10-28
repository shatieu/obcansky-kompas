import { AppBar } from "@/components/ui/app-bar";
import { ui } from "@/lib/content";
import { flags } from "@/lib/env";

/** Ukázkové prostředí (DEMO_MODE, POC_MODE, STATIC_DEMO) ukazuje v hlavičce SampleBadge. */
export function isSampleEnv(): boolean {
  return flags.demoMode() || flags.pocMode() || flags.staticDemo();
}

/** Online demonstrace – v navigaci i jako jediný odkaz v mobilní hlavičce (požadavek vlastníka 2026-10-28). */
const DEMO_HREF = "/demonstrace";

export function SiteHeader() {
  return (
    <AppBar
      sample={isSampleEnv()}
      sampleLabel={ui.demo.badge}
      wordmarkLabel={ui.site.name}
      wordmarkAria={ui.site.home_aria}
      quick={<a href={DEMO_HREF}>{ui.nav.demo}</a>}
      nav={
        <>
          {/* Obyčejné odkazy místo next/link: ušetří chunk routeru na /kompas (SPEC §4.6, 150 kB). */}
          <a href="/kompas">{ui.nav.compass}</a>
          <a href={DEMO_HREF}>{ui.nav.demo}</a>
          <a href="/statistiky">{ui.nav.stats}</a>
          <a href="/hnuti">{ui.nav.parties}</a>
        </>
      }
    />
  );
}

export function SiteFooter() {
  const links = [
    { href: "/demonstrace", label: ui.footer.demo },
    { href: "/hnuti", label: ui.footer.parties },
    { href: "/metodika", label: ui.footer.method },
    { href: "/souvisejici#k-precteni", label: ui.footer.reading },
    { href: "/o-projektu", label: ui.footer.about },
    { href: "/soukromi", label: ui.footer.privacy },
  ];
  return (
    <footer className="border-t-2 border-ink">
      <div className="k-wrap py-4">
        <p className="font-semibold">{ui.footer.lead}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="k-link">
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href={ui.footer.source_url} className="k-link" rel="noopener noreferrer">
              {ui.footer.source}
            </a>
          </li>
        </ul>
        <p className="k-cap mt-1">{ui.footer.license}</p>
      </div>
    </footer>
  );
}
