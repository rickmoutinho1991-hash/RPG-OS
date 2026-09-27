/**
 * RPG-OS — Guarda do caminho RBAC legacy (Vaga M-G/E).
 *
 * HÁ DOIS MODELOS DE PERMISSÕES:
 *   • moderno (dot): `getSessionContext()` + `hasPermission(ctx.permissions,
 *     "modulo.acao")` — é o que TODAS as rotas de RBAC fino usam;
 *   • legacy (colon): `getCurrentUser()` resolve `SYSTEM_ROLES` cujas
 *     permissões têm namespace de dois-pontos (`saft:export`, `company:manage`,
 *     `invoices:read`, …) — NUNCA coincidem com gates dot, logo são dead
 *     grants hoje. Os únicos consumidores possíveis são
 *     `requirePermission`/`requireRole` de `lib/auth/rbac.ts`, que não têm
 *     nenhum caller no app.
 *
 * Esta guarda impede re-regressão: se alguém ligar uma rota a
 * `requirePermission("saft:export")` (ou importar essas funções), os grants
 * colon tornam-se reais e fora do modelo dot declarado — um vetor de
 * inconsistência de RBAC. Invariantes:
 *   (a) `lib/auth/rbac.ts` só é importado para `requireAuth`;
 *   (b) `requirePermission(`/`requireRole(` nunca são chamados no app
 *       (fora da própria definição em rbac.ts);
 *   (c) nenhum gate (`hasPermission`/`guard`/`requirePermission`/`requireRole`)
 *       recebe literal de permissão com namespace de dois-pontos.
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file) || file.includes("__tests__");
}

const appDirs = [
  path.join(repoRoot, "apps", "web", "app"),
  path.join(repoRoot, "apps", "web", "components"),
  path.join(repoRoot, "apps", "web", "lib"),
];
const appFiles = appDirs.flatMap((dir) => walkTs(dir)).filter(
  (f) => !isTestFile(f),
);
const appCode = appFiles.map((f) => readFileSync(f, "utf8")).join("\n");

const RBAC_IMPORT_RE =
  /import\s*\{([^}]*)\}\s*from\s*["`']@\/lib\/auth\/rbac["`']/g;
const GATE_COLON_RE =
  /\b(?:hasPermission|guard|requirePermission|requireRole)\s*\(\s*(?:ctx|[a-zA-Z_$][\w$]*)\s*,\s*["`'][a-z_]+:[a-z_]+["`']/g;
const GATE_COLON_LITERAL_RE =
  /\b(?:hasPermission|guard|requirePermission)\s*\(\s*["`'][a-z_]+:[a-z_]+["`']/g;

describe("Caminho RBAC legacy (colon) — guarda de regressão (Vaga M-G/E)", () => {
  it("`lib/auth/rbac` não é importado para `requirePermission`/`requireRole`", () => {
    const offenders: string[] = [];
    for (const file of appFiles) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(RBAC_IMPORT_RE)) {
        const names = m[1]
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        for (const name of names) {
          if (name === "requirePermission" || name === "requireRole") {
            offenders.push(`${path.basename(file)}: ${name}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("`requirePermission(`/`requireRole(` nunca são invocados no app", () => {
    const calls = [
      ...appCode.matchAll(/\brequirePermission\(/g),
      ...appCode.matchAll(/\brequireRole\(/g),
    ].filter((m) => {
      // Excluir telas de definição (export function/async function) — o que
      // sobrar são callers reais.
      const start = Math.max(0, m.index - 60);
      const before = appCode.slice(start, m.index);
      return !/export\s+(?:async\s+)?function\s*$/.test(before);
    });
    expect(calls.length).toBe(0);
  });

  it("nenhum gate usa literal de permissão com namespace de dois-pontos", () => {
    const offenders = [
      ...appCode.matchAll(GATE_COLON_RE),
      ...appCode.matchAll(GATE_COLON_LITERAL_RE),
    ].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });
});