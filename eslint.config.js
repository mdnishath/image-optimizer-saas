// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],

  // ⬇️ Add this block to ignore Prisma generated files
  {
    ignores: ["lib/generated/prisma/**"],
  },
];
