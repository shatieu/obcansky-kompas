"use client";

import { useEffect } from "react";
import { reportArrival } from "@/lib/share/events";
import { isMoment } from "@/lib/share/moments";

/** Cookieless počítání příchodů přes sdílený odkaz (`?s=<moment>` → event share `<moment>:visit`). */
export function ShareArrival() {
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (isMoment(s)) reportArrival(s);
  }, []);
  return null;
}
