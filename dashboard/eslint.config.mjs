import { FlatCompat } from "@eslint/eslintrc";
import nextPlugin from "@next/eslint-plugin-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: nextPlugin.configs.recommended,
});

const eslintConfig = [
  // The recommended Next.js rules
  ...compat.extends("next/core-web-vitals"),

  // Add other configurations and rules as needed
  {
    ignores: ["*.config.js", ".next/", "node_modules/", "dist/", "public/"],
  },
];

export default eslintConfig;
