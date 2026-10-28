import slogansJson from "@/content/generated/demonstrace-slogans.json";
import type { DemoSlogansFile } from "./slogans-schema";

/** Předvolby sloganů davu za běhu (content/generated/demonstrace-slogans.json z content-build). */
export const demoSlogans = slogansJson as unknown as DemoSlogansFile;
export const DEFAULT_PRESET_ID = demoSlogans.default;
const PRESET_IDS = new Set(demoSlogans.presets.map((p) => p.id));

export const isPresetId = (v: string) => PRESET_IDS.has(v);
export const presetText = (pid: string) => demoSlogans.presets.find((p) => p.id === pid)?.text ?? null;
export type { DemoSlogansFile };
