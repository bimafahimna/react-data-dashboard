import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  plugins: [
    // Strip "use server" / "use client" directives so Vitest can import them
    {
      name: "strip-next-directives",
      transform(code) {
        return code
          .replace(/^["']use server["'];?\n?/m, "")
          .replace(/^["']use client["'];?\n?/m, "");
      },
    },
  ],
});
