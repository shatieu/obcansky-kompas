import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".pglite/**",
      "next-env.d.ts",
      "content/generated/**",
      "supabase/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default config;
