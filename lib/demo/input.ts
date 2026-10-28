import { z } from "zod";
import { MAX_REROLLS, NAME_MAX, POSES, SIGN_COLORS, SLOGAN_MAX, U32_MAX } from "./constants";
import { isPresetId } from "./slogans";

/**
 * Vstup připojení a úpravy (SPEC-demonstrace §3). Nejvýš jedno z sloganPresetId / sloganCustom;
 * s cedulí právě jedno, bez cedule (signColor `none`) může slogan chybět.
 * Délky se tady hlídají jen hrubě; obsah volných textů kontroluje scriptCheck (lib/moderation).
 */
const codePoints = (s: string) => Array.from(s).length;

const optText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .nullish()
    .transform((v) => {
      const t = v?.replace(/\s+/g, " ").trim();
      return t ? t : null;
    });

export const demoInputSchema = z
  .object({
    sloganPresetId: z.string().max(60).nullish(),
    sloganCustom: optText(SLOGAN_MAX),
    pose: z.enum(POSES),
    signColor: z.enum(SIGN_COLORS),
    seed: z.number().int().min(0).max(U32_MAX),
    rerollCount: z
      .number()
      .int()
      .min(0)
      .transform((n) => Math.min(n, MAX_REROLLS)),
    firstName: optText(NAME_MAX),
    consent: z.literal(true),
  })
  .superRefine((v, ctx) => {
    const hasPreset = Boolean(v.sloganPresetId);
    const hasCustom = Boolean(v.sloganCustom);
    const sloganOptional = v.signColor === "none";
    if (hasPreset && hasCustom) ctx.addIssue({ code: "custom", path: ["sloganPresetId"], message: "slogan" });
    if (!hasPreset && !hasCustom && !sloganOptional) ctx.addIssue({ code: "custom", path: ["sloganPresetId"], message: "slogan" });
    if (hasPreset && !isPresetId(v.sloganPresetId!)) ctx.addIssue({ code: "custom", path: ["sloganPresetId"], message: "slogan" });
    // Délka v kódových bodech (jako scriptCheck a klient), ne v UTF-16 jednotkách.
    if (v.sloganCustom && codePoints(v.sloganCustom) > SLOGAN_MAX) ctx.addIssue({ code: "custom", path: ["sloganCustom"], message: "slogan" });
    if (v.firstName && codePoints(v.firstName) > NAME_MAX) ctx.addIssue({ code: "custom", path: ["firstName"], message: "name" });
  });

export type DemoInput = z.output<typeof demoInputSchema>;

export const TILE_N_RE = /^(0|[1-9]\d{0,5})$/;
