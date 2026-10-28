/**
 * Texty /fotka a slogany (jen na serveru, při renderu statické stránky).
 * ui-fotka.yaml je dočasně samostatný soubor; po sloučení do ui.yaml stačí
 * `loadPhotoUi` nahradit za `ui.photo` z lib/content.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import slogansJson from "@/content/generated/slogans.json";
import { VARIANTS } from "./constants";

const frames = z.object(Object.fromEntries(VARIANTS.map((v) => [v, z.string().min(1)])) as Record<(typeof VARIANTS)[number], z.ZodString>);

export const PhotoUiSchema = z.object({
  meta_title: z.string(),
  meta_description: z.string(),
  kicker: z.string(),
  title: z.string(),
  lead: z.string(),
  pick_button: z.string(),
  camera_button: z.string(),
  change_button: z.string(),
  drop_hint: z.string(),
  drop_active: z.string(),
  loading: z.string(),
  heic_loading: z.string(),
  error_type: z.string(),
  error_decode: z.string(),
  error_heic: z.string(),
  error_export: z.string(),
  placeholder: z.string(),
  preview_label: z.string(),
  crop_title: z.string(),
  crop_hint: z.string(),
  keyboard_hint: z.string(),
  zoom_in_button: z.string(),
  zoom_out_button: z.string(),
  reset_button: z.string(),
  zoom_value: z.string(),
  frame_title: z.string(),
  frames,
  slogan_title: z.string(),
  download_title: z.string(),
  download_png_button: z.string(),
  download_jpg_button: z.string(),
  downloaded: z.string(),
  facebook_note: z.string(),
  howto_title: z.string(),
  howto_steps: z.array(z.string()).min(1),
});

export type PhotoUi = z.infer<typeof PhotoUiSchema>;

export const UI_FOTKA_PATH = path.join(process.cwd(), "content", "ui-fotka.yaml");

export function loadPhotoUi(file = UI_FOTKA_PATH): PhotoUi {
  const raw = parse(readFileSync(file, "utf8")) as { photo?: unknown };
  return PhotoUiSchema.parse(raw.photo);
}

const SlogansSchema = z.object({ slogans: z.array(z.object({ id: z.string(), text: z.string() })).min(1) });

/** Slogany ze slogans.yaml (zvalidované do content/generated při content:build). */
export function loadSlogans(): { id: string; text: string }[] {
  return SlogansSchema.parse(slogansJson).slogans;
}
