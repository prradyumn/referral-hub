// Next 16 removed `next lint`, so ESLint runs directly. eslint-config-next 16
// ships flat config as its default export — FlatCompat is not needed and in
// fact fails on it.
import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", ".screenshots/**", "next-env.d.ts"] },
  ...(Array.isArray(next) ? next : [next]),
  ...(Array.isArray(coreWebVitals) ? coreWebVitals : [coreWebVitals]),
  ...(Array.isArray(typescript) ? typescript : [typescript]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
