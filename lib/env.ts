/** Přepínače z env (SPEC §16). Čtou se líně, aby šly měnit v testech. */
const on = (name: string) => process.env[name] === "1" || process.env[name] === "true";

export const flags = {
  demoMode: () => on("DEMO_MODE"),
  pocMode: () => on("POC_MODE"),
  staticDemo: () => on("STATIC_DEMO"),
  readOnly: () => on("READ_ONLY"),
  /** Pruh „Ukázková data“ na stránkách se statistikami. */
  showDemoBar: () => on("DEMO_MODE") || on("STATIC_DEMO"),
};
