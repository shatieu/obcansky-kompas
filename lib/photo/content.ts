/**
 * Texty /fotka (content/ui.yaml, sekce photo) a slogany – jen na serveru, při renderu
 * statické stránky. Do klientského ui.json se sekce photo nezapisuje.
 */
import { z } from "zod";
import { readUiYaml, UI_YAML_PATH } from "@/lib/content/ui-server";
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
  ring_note: z.string().min(1),
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

export function loadPhotoUi(file = UI_YAML_PATH): PhotoUi {
  return PhotoUiSchema.parse(readUiYaml(file).photo);
}

const SlogansSchema = z.object({ slogans: z.array(z.object({ id: z.string(), text: z.string() })).min(1) });

/** Slogany ze slogans.yaml (zvalidované do content/generated při content:build). */
export function loadSlogans(): { id: string; text: string }[] {
  return SlogansSchema.parse(slogansJson).slogans;
}
