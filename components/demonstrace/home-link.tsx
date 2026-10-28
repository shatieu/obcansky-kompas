import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/**
 * Cesta zpět na hlavní stránku ze stránek demonstrace (požadavek vlastníka): textový odkaz
 * „‹ Zpět na hlavní stránku“ s cílem ≥ 48 px. Bez hooků – server i klient.
 */
export function HomeBackLink({ label, className }: { label: string; className?: string }) {
  return (
    <Link href="/" prefetch={false} className={`k-link inline-flex min-h-[48px] items-center gap-0.5 ${className ?? ""}`}>
      <Icon name="chevron-left" size={18} />
      {label}
    </Link>
  );
}
