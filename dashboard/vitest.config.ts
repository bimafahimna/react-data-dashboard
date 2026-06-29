import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
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
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
