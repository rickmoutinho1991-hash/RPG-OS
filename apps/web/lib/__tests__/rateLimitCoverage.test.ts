/**
 * RPG-OS — Rate limiting coverage (fail-closed).
 *
 * Mutações (POST/PUT/PATCH/DELETE) sem rate limiting são vulneráveis a:
 *  • brute force (login, validação de NIF, etc.);
 *  • abuso de API (spam de notificações, operações de marketplace);
 *  • negação de serviço económica (custo computacional por request).
 *
 * Invariante: toda rota de API que define um handler de mutação
 * (POST/PUT/PATCH/DELETE) importa e usa `rateLimit` de `@/lib/rate-limiter`.
 *
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const apiDir = path.join(repoRoot, "apps", "web", "app", "api");

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = walkRouteFiles(apiDir);

interface MutationRoute {
  file: string;
  handlers: string[];
}

const mutationRoutes: MutationRoute[] = [];
for (const file of routeFiles) {
  const source = readFileSync(file, "utf8");
  const handlers = [
    ...source.matchAll(
      /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g,
    ),
  ].map((m) => m[1]);
  if (handlers.length > 0) {
    mutationRoutes.push({
      file: path.relative(repoRoot, file),
      handlers,
    });
  }
}

describe("Rate limiting coverage (Vaga M-G/P)", () => {
  it("toda rota de mutação (POST/PUT/PATCH/DELETE) usa rateLimit", () => {
    const offenders: Array<{ file: string; handlers: string[] }> = [];
    for (const route of mutationRoutes) {
      const source = readFileSync(
        path.join(repoRoot, route.file),
        "utf8",
      );
      const hasRateLimitImport =
        /rateLimit/.test(source) &&
        /rate-limiter/.test(source);
      if (!hasRateLimitImport) {
        offenders.push({ file: route.file, handlers: route.handlers });
      }
    }
    expect(
      offenders,
      "rotas de mutação sem rate limiting (brute force / abuso / custo económico)",
    ).toEqual([]);
  });

  it("encontrou pelo menos uma rota de mutação para guardar", () => {
    expect(mutationRoutes.length).toBeGreaterThan(0);
  });
});