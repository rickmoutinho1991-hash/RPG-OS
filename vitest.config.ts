import { defineConfig } from "vitest/config";
import path from "node:path";

// Alias @/ -> apps/web (mesma convenção do tsconfig de apps/web).
// Sem isto, testes co-localizados em apps/web falham a importar código real.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
    },
  },
});
