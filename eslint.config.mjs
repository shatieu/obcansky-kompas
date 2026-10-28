import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Design system guardrail (docs/design-system/project/pravidla.md, „Tailwind guardrails“):
 * kompas.css už maže výchozí radius/shadow/blur tokeny, takže `rounded-xl` ani `shadow-lg` nevzniknou.
 * Tohle pravidlo chytá libovolné hodnoty, které by je obešly: rounded-[8px], shadow-[…],
 * drop-shadow-[…], blur-[…], backdrop-blur-*, a přechody bg-linear-* / bg-gradient-*.
 */
const FORBIDDEN_CLASS =
  /(^|[\s:"'`])(rounded(-[a-z]+)?-\[|(inset-|drop-|text-)?shadow-\[|(backdrop-)?blur-\[|backdrop-blur|bg-(linear|radial|conic|gradient)-)/;

const kompas = {
  rules: {
    "no-forbidden-classes": {
      meta: {
        type: "problem",
        docs: { description: "Zakázané libovolné hodnoty Tailwindu podle pravidla.md" },
        messages: {
          forbidden:
            "Design system: žádné zaoblení, stíny, rozostření ani přechody (pravidla.md). Povolené je jen rounded-round u profilové fotky a výběrové značky.",
        },
        schema: [],
      },
      create(context) {
        const check = (node, text) => {
          if (FORBIDDEN_CLASS.test(text)) context.report({ node, messageId: "forbidden" });
        };
        return {
          Literal(node) {
            if (typeof node.value === "string") check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};

const config = [
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: { kompas },
    rules: { "kompas/no-forbidden-classes": "error" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-*/**",
      ".pglite/**",
      "next-env.d.ts",
      "content/generated/**",
      "supabase/**",
      "playwright-report/**",
      "test-results/**",
      "docs/**",
    ],
  },
];

export default config;
