import { ui } from "@/lib/content";
import { SampleBanner } from "@/components/ui/sample";

/**
 * Pruh „Ukázková data“ (DEMO_MODE / STATIC_DEMO) – obal nad SampleBanner z components/ui.
 * Ponechán kvůli stránkám, které ho importují (app/hnuti, app/v/[uuid]/srovnani).
 */
export function DemoBar() {
  return (
    <div className="k-wrap py-2">
      <SampleBanner title={ui.demo.banner_title} text={ui.demo.banner_text} />
    </div>
  );
}
