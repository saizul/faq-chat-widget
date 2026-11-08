import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist", "node_modules", "demo/faq-chat-widget*.js", "_site"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
];
