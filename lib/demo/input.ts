import { z } from "zod";
import { MAX_REROLLS, NAME_MAX, POSES, SIGN_COLORS, SLOGAN_MAX, U32_MAX } from "./constants";
import { isPresetId } from "./slogans";

/**
 * Vstup připojení a úpravy (SPEC-demonstrace §3). Přesně jedno z sloganPresetId / sloganCustom.
 * Délky se tady hlídají jen hrubě; obsah volných textů kontroluje scriptCheck (lib/moderation).
 */
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
    if (hasPreset === hasCustom) ctx.addIssue({ code: "custom", path: ["sloganPresetId"], message: "slogan" });
    if (hasPreset && !isPresetId(v.sloganPresetId!)) ctx.addIssue({ code: "custom", path: ["sloganPresetId"], message: "slogan" });
    if (v.sloganCustom && v.sloganCustom.length > SLOGAN_MAX) ctx.addIssue({ code: "custom", path: ["sloganCustom"], message: "slogan" });
    if (v.firstName && v.firstName.length > NAME_MAX) ctx.addIssue({ code: "custom", path: ["firstName"], message: "name" });
  });

export type DemoInput = z.output<typeof demoInputSchema>;

export const TILE_N_RE = /^(0|[1-9]\d{0,5})$/;
