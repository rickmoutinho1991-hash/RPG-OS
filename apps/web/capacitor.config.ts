import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RPG-OS — Capacitor.
 *
 * ARQUITETURA: Capacitor requer `output: "export"` no Next.js (gera o
 * diretório `out/` estático que o Capacitor serve de dentro do APK).
 * Atualmente o core é PWA-first (FASE A — completa). A FASE B (APK nativo)
 * requer planeamento de rotas estáticas (generateStaticParams).
 *
 * Enquanto o build não for `output: "export"`, webDir é um PLACEHOLDER:
 * Sem server.url, sem cleartext, sem LAN — a app é offline-first dentro do
 * device.
 */
const config: CapacitorConfig = {
  appId: "pt.rpgos.app",
  appName: "RPG-OS",
  webDir: "dist", // Placeholder — requer output: "export" no Next.js

  server: {
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
