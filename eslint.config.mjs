import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["node_modules/**", ".next/**", ".next-*/**", "scratchpad/**", ".scratch/**", "generated/**", "storage/**", "playwright-report/**", "test-results/**"],
  },
  {
    rules: {
      // This app does not compile with the React Compiler. The compiler-oriented heuristic below
      // flags two patterns this codebase uses deliberately: hydration-safe defaults that read
      // localStorage / matchMedia after mount, and dialogs that reset local form state when they
      // open. Both are reviewed case by case; keep the signal as a warning rather than a build break.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
