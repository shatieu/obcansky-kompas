"use client";

import { useSyncExternalStore } from "react";

/**
 * Surová hodnota z localStorage / sessionStorage bez hydratačního rozdílu:
 * na serveru i při hydrataci `undefined`, pak řetězec nebo null.
 */
export function useStored(area: "local" | "session", key: string): string | null | undefined {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      try {
        return (area === "local" ? window.localStorage : window.sessionStorage).getItem(key);
      } catch {
        return null;
      }
    },
    () => undefined,
  );
}
