/**
 * RPG-OS — Fronteira web: exposição estática + guardas dev-only.
 *
 * Invariantes:
 *   (a) o `next.config.ts` desliga o header `X-Powered-By` (vaza "Next.js 16.x");
 *   (b) `apps/web/public/` só contém ativos estáticos permitidos (ícones,
 *       manifest, service worker) — nunca ficheiros sensíveis (env, dados,
 *       documentos, configs);
 *   (c) `apps/web/.env.example` nunca habilita dev-only em ambiente real:
 *       `ALLOW_FAKE_PROVIDERS=false` é obrigatório e `ALLOW_DEMO_ACCESS` tem de
 *       ficar comentado;
 *   (d) a rota `api/auth/callback/cmd` (auto-provision da Chave Móvel Digital)
 *       curto-circuita em produção ANTES de qualquer insert/admin — a guarda
 *       de NODE_ENV tem de preceder a lógica de provisionamento no source.
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appWebDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const readRel = (rel: string): string =>
  readFileSync(path.join(appWebDir, rel), "utf8");

describe("Fronteira web — exposição estática e guardas dev-only", () => {
  it("`next.config.ts` desliga o header X-Powered-By", () => {
    const source = readRel("next.config.ts");
    expect(source).toContain("poweredByHeader: false");
  });

  it("`apps/web/public/` só contém ativos estáticos permitidos", () => {
    // `sw-version.json` é gerado no build (gitignored) — carimbo de versão do
    // service worker, não é exposição.
    const allowlist =
      /^(apple-touch-icon|badge-72|icon-(128|192|256|384|512))\.png$|^(manifest|sw-version)\.json$|^sw\.js$/;
    const entries = readdirSync(path.join(appWebDir, "public"));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(
        allowlist.test(entry),
        `public/${entry} não está na allowlist de ativos estáticos`,
      ).toBe(true);
    }
  });

  it("`.env.example` nunca habilita dev-only em produção", () => {
    const example = readRel(".env.example");
    expect(example).toContain("ALLOW_FAKE_PROVIDERS=false");
    for (const line of example.split(/\r?\n/)) {
      if (/^\s*ALLOW_DEMO_ACCESS\s*=/.test(line)) {
        const isDevEnvOnly = /^\s*#/.test(line);
        expect(
          isDevEnvOnly,
          `.env.example linha "${line.trim()}" tem de ficar comentada (dev-only)`,
        ).toBe(true);
      }
    }
  });

  it("`api/auth/callback/cmd` curto-circuita em produção antes de provisionar", () => {
    const source = readRel(
      path.join("app", "api", "auth", "callback", "cmd", "route.ts"),
    );
    const prodGuard = source.indexOf(
      'process.env.NODE_ENV === "production"',
    );
    const firstAdmin = source.indexOf("createAdminClient()");
    const firstInsert = source.indexOf(".insert(");
    expect(prodGuard, "guarda de NODE_ENV tem de existir na rota").toBeGreaterThanOrEqual(0);
    if (firstAdmin !== -1) {
      expect(prodGuard).toBeLessThan(firstAdmin);
    }
    if (firstInsert !== -1) {
      expect(prodGuard).toBeLessThan(firstInsert);
    }
  });
});