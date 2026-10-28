import { stance, ui } from "@/lib/content";
import { StanceBlock as StancePlane } from "@/components/ui/stance-block";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { demoTexts } from "@/components/demonstrace/join/texts";
import { StanceCount } from "@/components/demonstrace/join/stance-count";

/**
 * Blok „Kde stojíme my“ (SPEC §9.1) s obsahem z content/stance.yaml – obal nad
 * components/ui/stance-block. Postoj se nikdy nepropisuje do kompasu, vysvětlivek ani statistik.
 * Třetí tlačítko „Připojit se k demonstraci“ + živý počet účastníků (SPEC-demonstrace §2):
 * vlastní řádek pod dvojicí tlačítek, počet načte malý klientský ostrůvek bez CLS.
 */
export function StanceBlock() {
  const [primary, secondary] = stance.actions;
  const d = demoTexts();
  return (
    <StancePlane
      kicker={stance.title}
      text={stance.text}
      by={ui.stance.by}
      ariaLabel={ui.stance.region_aria}
      primary={primary!}
      secondary={secondary}
      extra={
        <div className="mt-2">
          <ButtonLink href="/demonstrace/pripojit" variant="inverse-outline" block iconEnd="arrow-right">
            {d.stance_join_label}
          </ButtonLink>
          <TextLink href="/demonstrace" className="mt-1 inline-flex min-h-[48px] items-center text-inherit">
            <StanceCount texts={{ one: d.stance_count_one, few: d.stance_count_few, many: d.stance_count_many, zero: d.stance_count_zero }} />
          </TextLink>
        </div>
      }
    />
  );
}
