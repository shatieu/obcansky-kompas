import { stance, ui } from "@/lib/content";
import { StanceBlock as StancePlane } from "@/components/ui/stance-block";

/**
 * Blok „Kde stojíme my“ (SPEC §9.1) s obsahem z content/stance.yaml – obal nad
 * components/ui/stance-block. Postoj se nikdy nepropisuje do kompasu, vysvětlivek ani statistik.
 */
export function StanceBlock() {
  const [primary, secondary] = stance.actions;
  return (
    <StancePlane
      kicker={stance.title}
      text={stance.text}
      by={ui.stance.by}
      ariaLabel={ui.stance.region_aria}
      primary={primary!}
      secondary={secondary}
    />
  );
}
