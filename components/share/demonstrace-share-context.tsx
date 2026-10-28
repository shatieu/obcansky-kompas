"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SharePanelTexts } from "@/components/share/share-panel";
import type { DemoImageTexts } from "@/lib/share/demonstrace";

/**
 * Lehký kontext sdílení panáčka (jen typy, žádný SharePanel ani canvas) – stránka davu ho
 * obalí kolem CrowdView. Samotné DemoShare se načte líně až s otevřenou kartou (rozpočet JS
 * stránky davu, SPEC-demonstrace §6.3).
 */
export interface DemoShareConfig {
  texts: SharePanelTexts;
  image: DemoImageTexts;
  presets: Record<string, string>;
  defaultPreset: string;
}

const Ctx = createContext<DemoShareConfig | null>(null);

export function DemoShareProvider({ config, children }: { config: DemoShareConfig; children: ReactNode }) {
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

export const useDemoShare = () => useContext(Ctx);
